import { AuthError } from "@lenso/auth";
import { WorkspaceServiceError } from "@lenso/console-sdk/server";
import { EngineError } from "@lenso/engine/diagnostics";
import { boundedJson } from "@lenso/engine/operations";
import { ORPCError } from "@orpc/server";

import { ConsoleRequestError } from "./auth";
import { isConsoleOperationError } from "./errors";
import { readRequestBytes } from "./request-body";

const boundaryErrors = new WeakSet<Error>();

class BoundaryError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterMs?: number;
  constructor(code: string, status: number, retryAfterMs?: number) {
    super("Console request failed");
    this.name = "BoundaryError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function failure(
  code: string,
  status: number,
  retryAfterMs?: number
): BoundaryError {
  const error = new BoundaryError(code, status, retryAfterMs);
  boundaryErrors.add(error);
  return error;
}

export function rpcFailure(
  error: BoundaryError,
  headers: Headers
): ORPCError<string, unknown> {
  if (error.retryAfterMs !== undefined) {
    headers.set("retry-after", String(Math.ceil(error.retryAfterMs / 1000)));
    return new ORPCError(error.code, {
      data: { retryAfterMs: error.retryAfterMs },
    });
  }
  return new ORPCError(error.code);
}

export function safeError(error: unknown): BoundaryError {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    const cause = current;
    seen.add(cause);
    current = cause.cause;
    if (cause instanceof ConsoleRequestError) {
      const code = {
        bad_request: "BAD_REQUEST",
        unauthorized: "UNAUTHORIZED",
        forbidden: "FORBIDDEN",
        session_changed: "PRECONDITION_FAILED",
        service_unavailable: "SERVICE_UNAVAILABLE",
      }[cause.code];
      return failure(code, cause.status);
    }
    if (cause instanceof AuthError) {
      const status = {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        REAUTHENTICATION_REQUIRED: 401,
        SERVICE_UNAVAILABLE: 503,
      }[cause.code];
      return failure(
        cause.code === "REAUTHENTICATION_REQUIRED"
          ? "UNAUTHORIZED"
          : cause.code,
        status
      );
    }
    if (cause instanceof BoundaryError && boundaryErrors.has(cause)) {
      return cause;
    }
    if (isConsoleOperationError(cause)) {
      return failure(cause.code, cause.status, cause.retryAfterMs);
    }
    if (cause instanceof WorkspaceServiceError) {
      switch (cause.code) {
        case "denied": {
          return failure("FORBIDDEN", 403);
        }
        case "codec_mismatch": {
          return failure("UNPROCESSABLE_CONTENT", 422);
        }
        case "unknown_operation":
        case "unknown_service": {
          return failure("NOT_FOUND", 404);
        }
        case "request_too_large": {
          return failure("PAYLOAD_TOO_LARGE", 413);
        }
        default: {
          return failure("SERVICE_UNAVAILABLE", 503);
        }
      }
    }
  }
  if (error instanceof EngineError) {
    const { code } = error.diagnostic;
    if (["invalid-input", "invalid-task", "invalid-options"].includes(code)) {
      return failure("UNPROCESSABLE_CONTENT", 422);
    }
    if (["unknown-operation", "unknown-plugin", "not-found"].includes(code)) {
      return failure("NOT_FOUND", 404);
    }
    if (code === "conflict") {
      return failure("CONFLICT", 409);
    }
    if (code === "unsupported") {
      return failure("NOT_IMPLEMENTED", 501);
    }
    if (
      [
        "forbidden-operation",
        "confirmation-required",
        "approval-required",
        "forbidden",
        "denied",
      ].includes(code)
    ) {
      return failure("FORBIDDEN", 403);
    }
  }
  if (error instanceof ORPCError && error.code === "BAD_REQUEST") {
    return failure("UNPROCESSABLE_CONTENT", 422);
  }
  return failure("SERVICE_UNAVAILABLE", 503);
}

export function jsonInput(value: unknown): void {
  try {
    boundedJson(value);
  } catch (error) {
    const oversized =
      error instanceof EngineError &&
      error.diagnostic.code === "output-too-large";
    throw failure(
      oversized ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
      oversized ? 413 : 400
    );
  }
}

export function checkAbort(request: Request): void {
  request.signal.throwIfAborted();
}

export async function boundedRpcRequest(request: Request): Promise<Request> {
  if (!request.body) {
    return request;
  }
  const body = await readRequestBytes(request, 1024 * 1024 + 4096, () =>
    failure("PAYLOAD_TOO_LARGE", 413)
  );
  return new Request(request, { body, method: request.method });
}
