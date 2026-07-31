/* eslint-disable func-style, no-use-before-define */

export const runtimeObservabilityProtocol =
  "lenso.system-plane.runtime-observability.v1" as const;

export const runtimeObservabilityFeatures = {
  queueSummary: "queue-summary",
  recoveryFeed: "recovery-feed",
} as const;

export type RuntimeQueueKind = "outbox" | "functions";
export type RuntimeObservabilityStatus = "healthy" | "degraded" | "failing";
export type RuntimeObservationChangeKind = "upserted" | "deleted";
export type RuntimeObservationContinuity = "continuous" | "reset_required";
export type RuntimeObservationGapReason =
  | "invalid_cursor"
  | "service_revision_changed"
  | "schema_changed"
  | "retention_lost";

export interface RuntimeQueueSummary {
  queue: RuntimeQueueKind;
  pending: number;
  active: number;
  completed: number;
  failed: number;
  dead: number;
  oldestPendingAgeSeconds?: number;
  oldestFailedAgeSeconds?: number;
}

export interface RuntimeObservabilitySnapshot {
  protocol: typeof runtimeObservabilityProtocol;
  serviceId: string;
  serviceRevision: string;
  snapshotRevision: string;
  schemaDigest: string;
  nextCursor: string;
  observedAt: string;
  status: RuntimeObservabilityStatus;
  queues: RuntimeQueueSummary[];
}

export interface RuntimeObservationChange {
  sequence: number;
  queue: RuntimeQueueKind;
  resourceId: string;
  changeKind: RuntimeObservationChangeKind;
  recordedAt: string;
}

export interface RuntimeObservationEvidenceGap {
  reason: RuntimeObservationGapReason;
  message: string;
  requiredAction: string;
}

export interface RuntimeObservationFeed {
  protocol: typeof runtimeObservabilityProtocol;
  serviceId: string;
  serviceRevision: string;
  schemaDigest: string;
  collectedAt: string;
  continuity: RuntimeObservationContinuity;
  evidenceGap?: RuntimeObservationEvidenceGap;
  changes: RuntimeObservationChange[];
  nextCursor: string;
  hasMore: boolean;
}

export class RuntimeObservationContractError extends Error {
  readonly code = "runtime_observation_contract_invalid";

  constructor(message: string) {
    super(message);
    this.name = "RuntimeObservationContractError";
  }
}

export function parseRuntimeObservabilitySnapshot(
  value: unknown
): RuntimeObservabilitySnapshot {
  const record = exactRecord(value, [
    "protocol",
    "serviceId",
    "serviceRevision",
    "snapshotRevision",
    "schemaDigest",
    "nextCursor",
    "observedAt",
    "status",
    "queues",
  ]);
  const snapshot: RuntimeObservabilitySnapshot = {
    protocol: literal(
      record.protocol,
      runtimeObservabilityProtocol,
      "protocol"
    ),
    serviceId: nonEmptyString(record.serviceId, "serviceId"),
    serviceRevision: nonEmptyString(record.serviceRevision, "serviceRevision"),
    snapshotRevision: nonEmptyString(
      record.snapshotRevision,
      "snapshotRevision"
    ),
    schemaDigest: nonEmptyString(record.schemaDigest, "schemaDigest"),
    nextCursor: nonEmptyString(record.nextCursor, "nextCursor"),
    observedAt: dateTime(record.observedAt, "observedAt"),
    status: oneOf(record.status, ["healthy", "degraded", "failing"], "status"),
    queues: array(record.queues, "queues").map(parseQueueSummary),
  };
  const kinds = new Set(snapshot.queues.map((queue) => queue.queue));
  if (kinds.size !== snapshot.queues.length) {
    invalid("queues must contain each queue kind at most once");
  }
  return snapshot;
}

export function parseRuntimeObservationFeed(
  value: unknown
): RuntimeObservationFeed {
  const record = exactRecord(
    value,
    [
      "protocol",
      "serviceId",
      "serviceRevision",
      "schemaDigest",
      "collectedAt",
      "continuity",
      "changes",
      "nextCursor",
      "hasMore",
    ],
    ["evidenceGap"]
  );
  const continuity = oneOf(
    record.continuity,
    ["continuous", "reset_required"],
    "continuity"
  );
  const evidenceGap =
    record.evidenceGap === undefined
      ? undefined
      : parseEvidenceGap(record.evidenceGap);
  const changes = array(record.changes, "changes").map(parseChange);
  for (let index = 1; index < changes.length; index += 1) {
    if (changes[index]!.sequence <= changes[index - 1]!.sequence) {
      invalid("changes must be ordered by strictly increasing sequence");
    }
  }
  const nextCursor = string(record.nextCursor, "nextCursor");
  const hasMore = boolean(record.hasMore, "hasMore");
  if (continuity === "continuous" && evidenceGap !== undefined) {
    invalid("continuous feeds must not contain evidenceGap");
  }
  if (continuity === "continuous" && nextCursor.length === 0) {
    invalid("continuous feeds must provide nextCursor");
  }
  if (
    continuity === "reset_required" &&
    (evidenceGap === undefined ||
      changes.length > 0 ||
      nextCursor !== "" ||
      hasMore)
  ) {
    invalid("reset_required feeds must contain only an Evidence Gap");
  }
  return {
    protocol: literal(
      record.protocol,
      runtimeObservabilityProtocol,
      "protocol"
    ),
    serviceId: nonEmptyString(record.serviceId, "serviceId"),
    serviceRevision: nonEmptyString(record.serviceRevision, "serviceRevision"),
    schemaDigest: nonEmptyString(record.schemaDigest, "schemaDigest"),
    collectedAt: dateTime(record.collectedAt, "collectedAt"),
    continuity,
    ...(evidenceGap === undefined ? {} : { evidenceGap }),
    changes,
    nextCursor,
    hasMore,
  };
}

function parseQueueSummary(value: unknown, index: number): RuntimeQueueSummary {
  const path = `queues[${index}]`;
  const record = exactRecord(
    value,
    ["queue", "pending", "active", "completed", "failed", "dead"],
    ["oldestPendingAgeSeconds", "oldestFailedAgeSeconds"],
    path
  );
  const oldestPendingAgeSeconds = optionalCount(
    record.oldestPendingAgeSeconds,
    `${path}.oldestPendingAgeSeconds`
  );
  const oldestFailedAgeSeconds = optionalCount(
    record.oldestFailedAgeSeconds,
    `${path}.oldestFailedAgeSeconds`
  );
  return {
    queue: oneOf(record.queue, ["outbox", "functions"], `${path}.queue`),
    pending: count(record.pending, `${path}.pending`),
    active: count(record.active, `${path}.active`),
    completed: count(record.completed, `${path}.completed`),
    failed: count(record.failed, `${path}.failed`),
    dead: count(record.dead, `${path}.dead`),
    ...(oldestPendingAgeSeconds === undefined
      ? {}
      : { oldestPendingAgeSeconds }),
    ...(oldestFailedAgeSeconds === undefined ? {} : { oldestFailedAgeSeconds }),
  };
}

function parseChange(value: unknown, index: number): RuntimeObservationChange {
  const path = `changes[${index}]`;
  const record = exactRecord(
    value,
    ["sequence", "queue", "resourceId", "changeKind", "recordedAt"],
    [],
    path
  );
  return {
    sequence: count(record.sequence, `${path}.sequence`),
    queue: oneOf(record.queue, ["outbox", "functions"], `${path}.queue`),
    resourceId: nonEmptyString(record.resourceId, `${path}.resourceId`),
    changeKind: oneOf(
      record.changeKind,
      ["upserted", "deleted"],
      `${path}.changeKind`
    ),
    recordedAt: dateTime(record.recordedAt, `${path}.recordedAt`),
  };
}

function parseEvidenceGap(value: unknown): RuntimeObservationEvidenceGap {
  const record = exactRecord(
    value,
    ["reason", "message", "requiredAction"],
    []
  );
  return {
    reason: oneOf(
      record.reason,
      [
        "invalid_cursor",
        "service_revision_changed",
        "schema_changed",
        "retention_lost",
      ],
      "evidenceGap.reason"
    ),
    message: nonEmptyString(record.message, "evidenceGap.message"),
    requiredAction: nonEmptyString(
      record.requiredAction,
      "evidenceGap.requiredAction"
    ),
  };
}

function exactRecord(
  value: unknown,
  required: string[],
  optional: string[] = [],
  path = "document"
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      invalid(`${path}.${key} is not declared by the contract`);
    }
  }
  for (const key of required) {
    if (!(key in record)) {
      invalid(`${path}.${key} is required`);
    }
  }
  return record;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    invalid(`${path} must be an array`);
  }
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") {
    invalid(`${path} must be a string`);
  }
  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  const result = string(value, path);
  if (result.length === 0) {
    invalid(`${path} must not be empty`);
  }
  return result;
}

function dateTime(value: unknown, path: string): string {
  const result = nonEmptyString(value, path);
  if (!Number.isFinite(Date.parse(result))) {
    invalid(`${path} must be an RFC 3339 timestamp`);
  }
  return result;
}

function count(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(`${path} must be a non-negative safe integer`);
  }
  return value as number;
}

function optionalCount(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : count(value, path);
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    invalid(`${path} must be a boolean`);
  }
  return value;
}

function literal<const T extends string>(
  value: unknown,
  expected: T,
  path: string
): T {
  if (value !== expected) {
    invalid(`${path} must equal ${expected}`);
  }
  return expected;
}

function oneOf<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid(`${path} is not a supported value`);
  }
  return value as T;
}

function invalid(message: string): never {
  throw new RuntimeObservationContractError(message);
}
