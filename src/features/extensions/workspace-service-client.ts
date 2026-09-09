import type { PageMount } from "./page-contribution-catalog";

const MAX_REQUEST_BYTES = 1024 * 1024;

export type WorkspaceServiceOptions = { signal?: AbortSignal };

export type WorkspaceServices = {
  invoke<Request, Response>(
    service: string,
    operation: string,
    request: Request,
    options?: WorkspaceServiceOptions
  ): Promise<Response>;
  subscribe<Request, Item>(
    service: string,
    operation: string,
    request: Request,
    options?: WorkspaceServiceOptions
  ): AsyncIterable<Item>;
};

export class WorkspaceServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "WorkspaceServiceError";
    this.code = code;
    this.status = status;
  }
}

export class WorkspaceServiceDomainError extends WorkspaceServiceError {
  readonly payload: unknown;

  constructor(payload: unknown) {
    super(
      "Workspace service returned a Domain Error",
      "workspace_service_domain_error",
      422
    );
    this.name = "WorkspaceServiceDomainError";
    this.payload = payload;
  }
}

export function createWorkspaceServices(mount: PageMount): WorkspaceServices {
  const endpoint = (
    service: string,
    kind: "invoke" | "subscribe",
    operation: string
  ) => {
    requireOperation(mount, service, operation);
    return `/api/console/v1/pages/${encodeURIComponent(mount.id)}/services/${encodeURIComponent(service)}/${kind}/${encodeURIComponent(operation)}`;
  };
  return {
    async invoke<Request, Response>(
      service: string,
      operation: string,
      request: Request,
      options?: WorkspaceServiceOptions
    ) {
      const body = encodeRequest(request);
      const response = await fetch(endpoint(service, "invoke", operation), {
        body,
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: options?.signal ?? null,
      });
      if (!response.ok) {
        if (
          response.status === 422 &&
          response.headers.get("x-lenso-workspace-outcome") === "domain_error"
        ) {
          throw new WorkspaceServiceDomainError(
            await response.json().catch(() => null)
          );
        }
        throw await responseError(response);
      }
      try {
        return (await response.json()) as Response;
      } catch {
        throw protocolError();
      }
    },
    async *subscribe<Request, Item>(
      service: string,
      operation: string,
      request: Request,
      options?: WorkspaceServiceOptions
    ) {
      const body = encodeRequest(request);
      const response = await fetch(endpoint(service, "subscribe", operation), {
        body,
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
        signal: options?.signal ?? null,
      });
      if (!response.ok) {
        throw await responseError(response);
      }
      if (!response.body) {
        throw new WorkspaceServiceError(
          "Workspace service stream has no body",
          "workspace_service_protocol_error",
          502
        );
      }
      for await (const event of readServerEvents(response.body)) {
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
            throw new WorkspaceServiceDomainError(value);
          }
          if (frame.outcome !== "item") {
            throw protocolError();
          }
          yield value;
          continue;
        }
        if (event.event === "terminal") {
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

function requireOperation(
  mount: PageMount,
  service: string,
  operation: string
) {
  const requirement = mount.requirements.find(
    (candidate) => candidate.service_id === service
  );
  if (!requirement?.available || !requirement.operations.includes(operation)) {
    throw new WorkspaceServiceError(
      "Workspace service is not available for this mount",
      "workspace_service_unavailable",
      503
    );
  }
}

function encodeRequest(value: unknown) {
  const body = new TextEncoder().encode(JSON.stringify(value));
  if (body.byteLength > MAX_REQUEST_BYTES) {
    throw new WorkspaceServiceError(
      "Workspace service request exceeds one MiB",
      "workspace_service_request_too_large",
      413
    );
  }
  return body;
}

async function responseError(response: Response) {
  const value = (await response.json().catch(() => null)) as {
    code?: unknown;
    title?: unknown;
  } | null;
  return new WorkspaceServiceError(
    typeof value?.title === "string"
      ? value.title
      : "Workspace service request failed",
    typeof value?.code === "string"
      ? value.code
      : "workspace_service_request_failed",
    response.status
  );
}

function decodeJson<Value>(bodyBase64: string): Value {
  try {
    const normalized = bodyBase64.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const bytes = Uint8Array.from(
      atob(padded),
      (character) => character.codePointAt(0) ?? 0
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as Value;
  } catch {
    throw protocolError();
  }
}

function protocolError() {
  return new WorkspaceServiceError(
    "Workspace service returned a malformed response",
    "workspace_service_protocol_error",
    502
  );
}

async function* readServerEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseServerEvent(block);
        if (event) {
          yield event;
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) {
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseServerEvent(block: string) {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      event = line.slice(7);
    } else if (line.startsWith("data: ")) {
      data.push(line.slice(6));
    }
  }
  return data.length ? { data: data.join("\n"), event } : null;
}
