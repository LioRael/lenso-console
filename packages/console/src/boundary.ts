import { AuthError } from "@lenso/auth";
import { WorkspaceServiceError } from "@lenso/console-sdk/server";
import { EngineError } from "@lenso/engine/diagnostics";
import { boundedJson } from "@lenso/engine/operations";
import { ORPCError } from "@orpc/server";

import { ConsoleRequestError } from "./auth";
import { isConsoleOperationError } from "./errors";
import { readRequestBytes } from "./request-body";

const boundaryErrors = new WeakSet<Error>();
const safeIntentId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class BoundaryError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterMs?: number;
  readonly intentId?: string;
  constructor(
    code: string,
    status: number,
    retryAfterMs?: number,
    intentId?: string
  ) {
    super("Console request failed");
    this.name = "BoundaryError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.intentId = intentId;
  }
}

export function failure(
  code: string,
  status: number,
  retryAfterMs?: number,
  intentId?: string
): BoundaryError {
  const error = new BoundaryError(code, status, retryAfterMs, intentId);
  boundaryErrors.add(error);
  return error;
}

export function rpcFailure(
  error: BoundaryError,
  headers: Headers
): ORPCError<string, unknown> {
  if (
    error.code === "OUTCOME_UNKNOWN" &&
    error.intentId &&
    safeIntentId.test(error.intentId)
  ) {
    return new ORPCError(error.code, {
      data: { intentId: error.intentId },
    });
  }
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
        session_expired: "UNAUTHORIZED",
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
        RENEWAL_NOT_DUE: 409,
      }[cause.code];
      return failure(
        cause.code === "REAUTHENTICATION_REQUIRED"
          ? "UNAUTHORIZED"
          : cause.code === "RENEWAL_NOT_DUE"
            ? "CONFLICT"
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
    const { code, details } = error.diagnostic;
    const intentId =
      details !== null && typeof details === "object"
        ? Reflect.get(details, "intentId")
        : undefined;
    if (
      code === "outcome-unknown" &&
      typeof intentId === "string" &&
      safeIntentId.test(intentId)
    ) {
      return failure("OUTCOME_UNKNOWN", 503, undefined, intentId);
    }
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
