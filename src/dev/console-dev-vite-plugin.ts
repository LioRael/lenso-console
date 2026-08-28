import { createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { PluginOption } from "vite";

import demoPluginWorkbenchProjection from "../features/plugins/demo-plugin-workbench.json" with { type: "json" };

interface ConsoleDevPluginOptions {
  diagnosticsFile?: string | undefined;
  hostUrl?: string | undefined;
}

type NextFunction = (error?: unknown) => void;

export function consoleDevPlugin({
  diagnosticsFile,
  hostUrl,
}: ConsoleDevPluginOptions = {}): PluginOption {
  return {
    name: "lenso-console-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        runConsoleDevRequest({
          next,
          options: { diagnosticsFile, hostUrl },
          req,
          res,
        });
      });
    },
  };
}

function runConsoleDevRequest(params: {
  next: NextFunction;
  options: ConsoleDevPluginOptions;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  void handleConsoleDevRequestSafely(params);
}

async function handleConsoleDevRequestSafely(params: {
  next: NextFunction;
  options: ConsoleDevPluginOptions;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  try {
    await handleConsoleDevRequest(params);
  } catch (error) {
    params.next(error);
  }
}

async function handleConsoleDevRequest({
  next,
  options,
  req,
  res,
}: {
  next: NextFunction;
  options: ConsoleDevPluginOptions;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  if (!req.url) {
    next();
    return;
  }

  const pathname = requestPathname(req.url);
  if (pathname === "/console/dev/diagnostics.json" && options.diagnosticsFile) {
    sendFile(res, options.diagnosticsFile, "application/json");
    return;
  }

  if (pathname === "/api/console/v1/composition" && options.hostUrl) {
    sendJson(res, consoleDevComposition());
    return;
  }

  if (pathname === "/console/dev/plugin-workbench/events") {
    sendPluginWorkbenchEvents(res);
    return;
  }

  if (options.hostUrl && shouldProxyToHost(pathname)) {
    await proxyToHost({ hostUrl: options.hostUrl, req, res });
    return;
  }

  next();
}

function requestPathname(url: string) {
  return new URL(url, "http://lenso.local").pathname;
}

function shouldProxyToHost(pathname: string) {
  return (
    pathname.startsWith("/api/console/") ||
    pathname.startsWith("/system-plane/")
  );
}

function sendFile(
  res: ServerResponse,
  filePath: string,
  contentType: string,
  { fallbackBody }: { fallbackBody?: string | undefined } = {}
) {
  if (!existsSync(filePath)) {
    res.statusCode = fallbackBody === undefined ? 404 : 200;
    res.setHeader("content-type", contentType);
    res.end(fallbackBody ?? "not found");
    return;
  }
  res.setHeader("content-type", contentType);
  createReadStream(filePath).pipe(res);
}

function sendJson(res: ServerResponse, value: unknown) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
}

function sendPluginWorkbenchEvents(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("cache-control", "no-cache");
  res.setHeader("content-type", "text/event-stream");
  res.flushHeaders();
  const projection = {
    ...demoPluginWorkbenchProjection,
    observedAt: new Date().toISOString(),
    stream: { ...demoPluginWorkbenchProjection.stream, cursor: "18" },
  };
  res.write(
    `id: 18\nevent: workbench.snapshot\ndata: ${JSON.stringify({
      eventId: "18",
      occurredAt: projection.observedAt,
      projection,
      type: "workbench.snapshot",
    })}\n\n`
  );
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
  res.on("close", () => clearInterval(heartbeat));
}

export function consoleDevComposition() {
  return {
    issues: [],
    modules: [
      { kind: "shell", moduleId: "console-dev-shell" },
      { kind: "mandatory", moduleId: "auth", role: "identity" },
      {
        kind: "mandatory",
        moduleId: "console-dev-host",
        role: "system_registry",
      },
    ],
    schema: "lenso.console-service-composition.v2",
    serviceId: "lenso-console",
    status: "ready",
    workloadMode: "normal",
  } as const;
}

async function proxyToHost({
  hostUrl,
  req,
  res,
}: {
  hostUrl: string;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  const target = new URL(req.url ?? "/", hostUrl);
  const body = await requestBody(req);
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const init: RequestInit = {
    headers: proxyHeaders(req),
    signal: controller.signal,
  };
  if (req.method) {
    init.method = req.method;
  }
  if (body) {
    init.body = new Uint8Array(body);
  }
  const response = await fetch(target, init);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  while (!controller.signal.aborted) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    res.write(Buffer.from(value));
  }
  res.end();
}

function proxyHeaders(req: IncomingMessage) {
  const headers = new Headers();
  const accept = firstHeader(req.headers.accept) ?? "*/*";
  const authorization = firstHeader(req.headers.authorization);
  const contentType = firstHeader(req.headers["content-type"]);

  headers.set("accept", accept);
  if (authorization) {
    headers.set("authorization", authorization);
  }
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return headers;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function requestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}
