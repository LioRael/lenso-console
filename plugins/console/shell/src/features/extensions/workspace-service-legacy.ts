import type { WorkspaceServices } from "../../../../../../packages/console-authoring/src/index";
import {
  WorkspaceServiceDomainError,
  WorkspaceServiceError,
} from "../../../../../../packages/console-authoring/src/transport";
import { sessionFetch } from "../../lib/session-fetch";
import type { PageMount } from "./page-contribution-catalog";

// Transitional browser boundary for pre-v2 Hosts. The TS server never imports
// this adapter; new descriptors explicitly select the oRPC transport.
export function createLegacyWorkspaceServices(
  mount: PageMount,
  lifetime?: AbortSignal,
  expectedSubject?: string
): WorkspaceServices {
  const requestSignal = (signal?: AbortSignal) => {
    const signals = [lifetime, mount.transport?.signal, signal].filter(
      (value): value is AbortSignal => !!value
    );
    const combined = signals.length ? AbortSignal.any(signals) : undefined;
    combined?.throwIfAborted();
    return combined;
  };
  const actor = mount.transport?.subject ?? expectedSubject;
  const headers = {
    "content-type": "application/json",
    "x-lenso-page-owner": mount.owner.instance,
    "x-lenso-page-revision": mount.revision,
    ...(actor ? { "x-lenso-expected-subject": actor } : {}),
    ...(mount.implementationId
      ? { "x-lenso-page-implementation": mount.implementationId }
      : {}),
  };
  const endpoint = (
    service: string,
    kind: "invoke" | "subscribe",
    operation: string
  ) => {
    const requirement = mount.requirements.find(
      (item) => item.service_id === service
    );
    if (
      !requirement?.available ||
      !requirement.operations.includes(operation)
    ) {
      throw new WorkspaceServiceError(
        `Workspace service ${service}/${operation} is not admitted for mount ${mount.id}`,
        "workspace_service_unavailable",
        503
      );
    }
    return `${mount.transport?.apiBasePath ?? "/api"}/console/v1/pages/${encodeURIComponent(mount.id)}/services/${encodeURIComponent(service)}/${kind}/${encodeURIComponent(operation)}`;
  };
  return {
    async invoke<Request, Response>(
      service: string,
      operation: string,
      input: Request,
      options?: { signal?: AbortSignal }
    ) {
      const signal = requestSignal(options?.signal);
      const response = await sessionFetch(
        endpoint(service, "invoke", operation),
        {
          body: encodeRequest(input),
          headers,
          method: "POST",
          signal: signal ?? null,
          cache: "no-store",
        },
        mount.transport
      );
      signal?.throwIfAborted();
      if (!response.ok) {
        if (
          response.status === 422 &&
          response.headers.get("x-lenso-workspace-outcome") === "domain_error"
        ) {
          const payload: unknown = await response.json().catch(() => null);
          signal?.throwIfAborted();
          throw new WorkspaceServiceDomainError(payload, service, operation);
        }
        const error = await responseError(response, service, operation);
        signal?.throwIfAborted();
        throw error;
      }
      try {
        const value = (await response.json()) as Response;
        signal?.throwIfAborted();
        return value;
      } catch {
        signal?.throwIfAborted();
        throw protocolError();
      }
    },
    async *subscribe<Request, Item>(
      service: string,
      operation: string,
      input: Request,
      options?: { signal?: AbortSignal }
    ) {
      const signal = requestSignal(options?.signal);
      const response = await sessionFetch(
        endpoint(service, "subscribe", operation),
        {
          body: encodeRequest(input),
          headers: { ...headers, accept: "text/event-stream" },
          method: "POST",
          signal: signal ?? null,
          cache: "no-store",
        },
        mount.transport
      );
      signal?.throwIfAborted();
      if (!response.ok) {
        const error = await responseError(response, service, operation);
        signal?.throwIfAborted();
        throw error;
      }
      if (!response.body) {
        throw protocolError();
      }
      for await (const event of readServerEvents(response.body, signal)) {
        signal?.throwIfAborted();
        if (event.event === "item") {
          const frame = JSON.parse(event.data) as {
            bodyBase64Url?: unknown;
            outcome?: unknown;
          };
          if (typeof frame.bodyBase64Url !== "string") {
            throw protocolError();
          }
          const value = decodeJson<Item>(frame.bodyBase64Url);
          if (frame.outcome === "domain_error") {
            throw new WorkspaceServiceDomainError(value, service, operation);
          }
          if (frame.outcome !== "item") {
            throw protocolError();
          }
          yield value;
        } else if (event.event === "terminal") {
          const terminal = JSON.parse(event.data) as {
            code?: unknown;
            outcome?: unknown;
          };
          if (terminal.outcome === "success") {
            return;
          }
          throw new WorkspaceServiceError(
            "Workspace service stream failed",
            typeof terminal.code === "string"
              ? terminal.code
              : "workspace_service_stream_failed",
            terminal.outcome === "domain_error" ? 422 : 503
          );
        }
      }
      throw protocolError();
    },
  };
}

function encodeRequest(value: unknown) {
  const body = new TextEncoder().encode(JSON.stringify(value));
  if (body.byteLength > 1024 * 1024) {
    throw new WorkspaceServiceError(
      "Workspace service request exceeds one MiB",
      "workspace_service_request_too_large",
      413
    );
  }
  return body;
}

async function responseError(
  response: Response,
  service: string,
  operation: string
) {
  const value = (await response.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  return new WorkspaceServiceError(
    `Workspace service ${service}/${operation}: ${typeof value?.code === "string" ? value.code : "request failed"}`,
    typeof value?.code === "string"
      ? value.code
      : "workspace_service_request_failed",
    response.status
  );
}

function protocolError() {
  return new WorkspaceServiceError(
    "Workspace service returned a malformed response",
    "workspace_service_protocol_error",
    502
  );
}

function decodeJson<Value>(body: string): Value {
  try {
    const normalized = body.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(padded),
          (character) => character.codePointAt(0) ?? 0
        )
      )
    ) as Value;
  } catch {
    throw protocolError();
  }
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel();
  } catch {
    // An errored transport still needs its reader lock released.
  }
}

async function* readServerEvents(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
) {
  const reader = stream.getReader();
  const cancel = () => {
    void cancelReader(reader);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            event = line.slice(7);
          } else if (line.startsWith("data: ")) {
            data.push(line.slice(6));
          }
        }
        if (data.length) {
          yield { data: data.join("\n"), event };
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) {
        return;
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await cancelReader(reader);
    reader.releaseLock();
  }
}
