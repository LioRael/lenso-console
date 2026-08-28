import { consoleApiAuthToken, consoleApiPrefix } from "../../lib/http-client";
import {
  pluginWorkbenchProjectionFromEvent,
  type PluginWorkbenchProjection,
} from "./plugin-workbench-model";

export type PluginWorkbenchStreamState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "stopped";

type StreamOptions = {
  cursor?: string | undefined;
  onProjection: (projection: PluginWorkbenchProjection) => void;
  onState: (state: PluginWorkbenchStreamState) => void;
  path: string;
  signal: AbortSignal;
};

export async function observePluginWorkbench({
  cursor,
  onProjection,
  onState,
  path,
  signal,
}: StreamOptions): Promise<void> {
  let lastEventId = cursor;
  let reconnecting = false;
  while (!signal.aborted) {
    onState(reconnecting ? "reconnecting" : "connecting");
    try {
      const response = await fetch(consoleStreamUrl(path), {
        headers: streamHeaders(lastEventId),
        signal,
      });
      if (!(response.ok && response.body)) {
        throw new Error(`Plugin stream returned ${response.status}`);
      }
      onState("live");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const decoded = decodeSseFrames(pending);
        ({ pending } = decoded);
        for (const frame of decoded.frames) {
          lastEventId = frame.id ?? lastEventId;
          const projection = parseProjection(frame.data);
          if (projection) {
            onProjection(projection);
          }
        }
        if (done) {
          break;
        }
      }
    } catch (error) {
      if (signal.aborted) {
        break;
      }
      void error;
    }
    if (signal.aborted) {
      break;
    }
    reconnecting = true;
    await reconnectDelay(signal);
  }
  onState("stopped");
}

export function decodeSseFrames(input: string): {
  frames: { data: string; id?: string }[];
  pending: string;
} {
  const normalized = input.replaceAll("\r\n", "\n");
  const chunks = normalized.split("\n\n");
  const pending = chunks.pop() ?? "";
  const frames = chunks.flatMap((chunk) => {
    const data: string[] = [];
    let id: string | undefined;
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      } else if (line.startsWith("id:")) {
        id = line.slice(3).trimStart();
      }
    }
    return data.length > 0
      ? [{ data: data.join("\n"), ...(id ? { id } : {}) }]
      : [];
  });
  return { frames, pending };
}

function parseProjection(data: string) {
  try {
    return pluginWorkbenchProjectionFromEvent(JSON.parse(data));
  } catch {
    return undefined;
  }
}

function consoleStreamUrl(path: string) {
  if (/^https?:\/\//u.test(path)) {
    throw new Error("Plugin stream path must be same-origin");
  }
  const prefix = consoleApiPrefix();
  if (!prefix || prefix === "/") {
    return path.startsWith("/") ? path : `/${path}`;
  }
  return `${prefix}/${path.replace(/^\/+/, "")}`;
}

function streamHeaders(lastEventId: string | undefined) {
  const headers = new Headers({ Accept: "text/event-stream" });
  const token = consoleApiAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (lastEventId) {
    headers.set("Last-Event-ID", lastEventId);
  }
  return headers;
}

async function reconnectDelay(signal: AbortSignal) {
  const delay = AbortSignal.any([signal, AbortSignal.timeout(1000)]);
  if (delay.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    delay.addEventListener("abort", () => resolve(), { once: true });
  });
}
