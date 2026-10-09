import type { WorkspaceCredentials } from "./index";
import { WorkspaceServiceError } from "./transport";

export interface ConsoleCredentialPaths {
  issuePath?: string;
  rotatePath?: string;
}

export function createConsoleWorkspaceCredentials(options: {
  paths: ConsoleCredentialPaths;
  origin?: string;
  signal?: AbortSignal;
  expectedSubject?: string;
  headers?: () => HeadersInit | Promise<HeadersInit>;
  fetch?: typeof globalThis.fetch;
}): WorkspaceCredentials {
  for (const path of Object.values(options.paths)) {
    if (
      path !== undefined &&
      !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(path)
    ) {
      throw new TypeError("Credential paths must be exact local paths");
    }
  }
  async function send(
    path: string | undefined,
    input: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    if (!path) {
      throw new WorkspaceServiceError(
        "Credential operation is not installed",
        "FORBIDDEN",
        403
      );
    }
    const signals = [options.signal, signal].filter(
      (value): value is AbortSignal => value !== undefined
    );
    const combined = signals.length ? AbortSignal.any(signals) : undefined;
    combined?.throwIfAborted();
    const headers = new Headers(await options.headers?.());
    headers.set("content-type", "application/json");
    if (options.expectedSubject) {
      headers.set("x-lenso-expected-subject", options.expectedSubject);
    }
    const url = options.origin ? new URL(path, options.origin).href : path;
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: "POST",
      body: JSON.stringify(input),
      headers,
      cache: "no-store",
      redirect: "error",
      credentials: "same-origin",
      ...(combined ? { signal: combined } : {}),
    });
    combined?.throwIfAborted();
    if (!response.ok) {
      const code =
        (
          {
            400: "UNPROCESSABLE_CONTENT",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            409: "CONFLICT",
            412: "PRECONDITION_FAILED",
            429: "TOO_MANY_REQUESTS",
          } as Record<number, string>
        )[response.status] ?? "SERVICE_UNAVAILABLE";
      throw new WorkspaceServiceError(
        "Credential operation could not be confirmed",
        code,
        response.status
      );
    }
    const text = await response.text();
    combined?.throwIfAborted();
    if (new TextEncoder().encode(text).byteLength > 128 * 1024) {
      throw new WorkspaceServiceError(
        "Credential response exceeds its budget",
        "SERVICE_UNAVAILABLE",
        502
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new WorkspaceServiceError(
        "Credential response is invalid",
        "SERVICE_UNAVAILABLE",
        502
      );
    }
  }
  return {
    operations: [
      ...(options.paths.issuePath ? ["issue" as const] : []),
      ...(options.paths.rotatePath ? ["rotate" as const] : []),
    ],
    issue: (input, call) => send(options.paths.issuePath, input, call?.signal),
    rotate: (input, call) =>
      send(options.paths.rotatePath, input, call?.signal),
  };
}
