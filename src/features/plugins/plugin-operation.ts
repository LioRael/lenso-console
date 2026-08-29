import {
  decodeDesiredPluginSelection,
  type DesiredPluginSelection,
} from "./plugin-control-contract";

const OPERATION_POLL_BACKOFF_MS = [150, 250, 400, 650, 1000] as const;

export type PluginOperationStatus =
  | "accepted"
  | "preparing"
  | "rejected"
  | "rolled_back"
  | "switched";

export type PluginOperation = {
  acceptedAfterCursor: string;
  cursor: string;
  desiredStateDigest?: string;
  detail?: string;
  generationSpecDigest?: string;
  id: string;
  planDigest?: string;
  pluginRootRevision?: string;
  status: PluginOperationStatus;
};

export type PluginMutationReceipt = {
  desired: DesiredPluginSelection | null;
  operation: PluginOperation;
  schema: "lenso.agent.plugin-operation.v1";
};

export type PluginOperationResponse = {
  operation: PluginOperation;
  schema: "lenso.agent.plugin-operation.v1";
};

export class PluginOperationFailedError extends Error {
  readonly operation: PluginOperation;

  constructor(operation: PluginOperation) {
    super(
      operation.detail ??
        `Plugin change ${operation.status === "rolled_back" ? "rolled back" : "was rejected"}`
    );
    this.name = "PluginOperationFailedError";
    this.operation = operation;
  }
}

export class PluginOperationTimeoutError extends Error {
  readonly operation: PluginOperation;

  constructor(operation: PluginOperation) {
    super(
      "The Host accepted the Plugin change, but did not report a terminal Generation state before the Console timeout"
    );
    this.name = "PluginOperationTimeoutError";
    this.operation = operation;
  }
}

export function decodePluginMutationReceipt(
  value: unknown
): PluginMutationReceipt {
  if (!isRecord(value) || value.schema !== "lenso.agent.plugin-operation.v1") {
    throw new TypeError(
      "Agent Host accepted the write without a verifiable Plugin operation receipt; upgrade the Host before using Console Plugin controls"
    );
  }
  if (!isPluginOperation(value.operation)) {
    throw new TypeError(
      "Agent Host returned an invalid Plugin operation receipt"
    );
  }
  if (value.desired !== null) {
    const desired = decodeDesiredPluginSelection(value.desired);
    if (
      value.operation.pluginRootRevision !== desired.pluginRootRevision ||
      value.operation.desiredStateDigest !== desired.desiredStateDigest ||
      value.operation.planDigest !== desired.planDigest
    ) {
      throw new TypeError(
        "Agent Host returned a Plugin operation that does not identify its Desired selection"
      );
    }
  } else if (value.operation.status !== "rejected") {
    throw new TypeError(
      "Agent Host returned a Plugin operation without its Desired selection"
    );
  }
  return value as PluginMutationReceipt;
}

export function decodePluginOperationResponse(
  value: unknown
): PluginOperationResponse {
  if (
    !isRecord(value) ||
    value.schema !== "lenso.agent.plugin-operation.v1" ||
    !isPluginOperation(value.operation)
  ) {
    throw new TypeError(
      "Agent Host returned an invalid Plugin operation response"
    );
  }
  return value as PluginOperationResponse;
}

export function isTerminalPluginOperation(operation: PluginOperation) {
  return (
    operation.status === "rejected" ||
    operation.status === "rolled_back" ||
    operation.status === "switched"
  );
}

export async function waitForPluginOperation({
  initial,
  onProgress,
  pollIntervalMs,
  read,
  signal,
  timeoutMs = 30_000,
}: {
  initial: PluginOperation;
  onProgress?: (operation: PluginOperation) => void;
  pollIntervalMs?: number;
  read: (operationId: string, signal: AbortSignal) => Promise<PluginOperation>;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<PluginOperation> {
  let operation = initial;
  onProgress?.(operation);
  if (isTerminalPluginOperation(operation)) {
    return operation;
  }
  if (timeoutMs <= 0) {
    throw new PluginOperationTimeoutError(operation);
  }
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () =>
      timeoutController.abort(
        new DOMException("Plugin operation timed out", "TimeoutError")
      ),
    timeoutMs
  );
  const pollingSignal = AbortSignal.any([signal, timeoutController.signal]);
  let backoffIndex = 0;
  try {
    while (true) {
      const delay =
        pollIntervalMs ??
        OPERATION_POLL_BACKOFF_MS[
          Math.min(backoffIndex, OPERATION_POLL_BACKOFF_MS.length - 1)
        ] ??
        1000;
      await abortableDelay(delay, pollingSignal);
      const previous = operation;
      operation = await read(operation.id, pollingSignal);
      assertOperationContinuation(previous, operation);
      onProgress?.(operation);
      if (isTerminalPluginOperation(operation)) {
        return operation;
      }
      backoffIndex = operationProgressed(previous, operation)
        ? 0
        : Math.min(backoffIndex + 1, OPERATION_POLL_BACKOFF_MS.length - 1);
    }
  } catch (error) {
    if (timeoutController.signal.aborted && !signal.aborted) {
      throw new PluginOperationTimeoutError(operation);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function operationProgressed(
  previous: PluginOperation,
  current: PluginOperation
) {
  return (
    previous.status !== current.status ||
    BigInt(previous.cursor) < BigInt(current.cursor)
  );
}

function assertOperationContinuation(
  previous: PluginOperation,
  current: PluginOperation
) {
  if (
    current.id !== previous.id ||
    current.acceptedAfterCursor !== previous.acceptedAfterCursor ||
    current.pluginRootRevision !== previous.pluginRootRevision ||
    current.desiredStateDigest !== previous.desiredStateDigest ||
    current.planDigest !== previous.planDigest ||
    (previous.generationSpecDigest !== undefined &&
      current.generationSpecDigest !== previous.generationSpecDigest) ||
    BigInt(current.cursor) < BigInt(previous.cursor) ||
    !statusCanFollow(previous.status, current.status)
  ) {
    throw new TypeError(
      "Agent Host returned an inconsistent Plugin operation continuation"
    );
  }
}

function statusCanFollow(
  previous: PluginOperationStatus,
  current: PluginOperationStatus
) {
  if (previous === current) {
    return true;
  }
  if (previous === "accepted") {
    return (
      current === "preparing" ||
      current === "switched" ||
      current === "rejected"
    );
  }
  if (previous === "preparing") {
    return (
      current === "switched" ||
      current === "rejected" ||
      current === "rolled_back"
    );
  }
  if (previous === "switched") {
    return current === "rejected" || current === "rolled_back";
  }
  return false;
}

function abortableDelay(durationMs: number, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(abortReason(signal));
  }
  return new Promise<void>((resolve, reject) => {
    function complete() {
      signal.removeEventListener("abort", cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timer);
      reject(abortReason(signal));
    }
    const timer = setTimeout(complete, durationMs);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) {
      cancel();
    }
  });
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Operation cancelled", "AbortError");
}

function isCursor(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

function isPluginOperation(value: unknown): value is PluginOperation {
  if (
    !(
      isRecord(value) &&
      isCursor(value.acceptedAfterCursor) &&
      isCursor(value.cursor) &&
      optionalNonEmptyString(value.desiredStateDigest) &&
      optionalNonEmptyString(value.detail) &&
      optionalNonEmptyString(value.generationSpecDigest) &&
      typeof value.id === "string" &&
      value.id.length > 0 &&
      optionalNonEmptyString(value.planDigest) &&
      optionalNonEmptyString(value.pluginRootRevision) &&
      (value.status === "accepted" ||
        value.status === "preparing" ||
        value.status === "rejected" ||
        value.status === "rolled_back" ||
        value.status === "switched")
    )
  ) {
    return false;
  }
  if (BigInt(value.cursor) < BigInt(value.acceptedAfterCursor)) {
    return false;
  }
  const hasDesiredIdentity =
    typeof value.desiredStateDigest === "string" &&
    typeof value.planDigest === "string" &&
    typeof value.pluginRootRevision === "string";
  if (value.status === "accepted") {
    return hasDesiredIdentity;
  }
  if (value.status === "preparing" || value.status === "switched") {
    return hasDesiredIdentity && typeof value.generationSpecDigest === "string";
  }
  if (value.status === "rolled_back") {
    return (
      hasDesiredIdentity &&
      typeof value.generationSpecDigest === "string" &&
      typeof value.detail === "string"
    );
  }
  return typeof value.detail === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function optionalNonEmptyString(value: unknown) {
  return value === undefined || (typeof value === "string" && value.length > 0);
}
