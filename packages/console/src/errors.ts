const statuses = {
  CONFLICT: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
} as const;

export type ConsoleOperationErrorCode = keyof typeof statuses;

const issued = new WeakSet<ConsoleOperationError>();

/** A trusted adapter's public classification. Raw messages and causes stay server-side. */
export class ConsoleOperationError extends Error {
  readonly code: ConsoleOperationErrorCode;
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(
    code: ConsoleOperationErrorCode,
    options: { retryAfterMs?: number; cause?: unknown } = {}
  ) {
    super("Console operation failed", { cause: options.cause });
    if (!Object.hasOwn(statuses, code)) {
      throw new TypeError("Unsupported Console operation error");
    }
    if (
      options.retryAfterMs !== undefined &&
      (code !== "TOO_MANY_REQUESTS" ||
        !Number.isFinite(options.retryAfterMs) ||
        options.retryAfterMs < 0 ||
        options.retryAfterMs > Number.MAX_SAFE_INTEGER)
    ) {
      throw new TypeError("Invalid Console retry estimate");
    }
    this.name = "ConsoleOperationError";
    this.code = code;
    this.status = statuses[code];
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
    issued.add(this);
    Object.freeze(this);
  }
}

export function isConsoleOperationError(
  error: unknown
): error is ConsoleOperationError {
  return error instanceof ConsoleOperationError && issued.has(error);
}
