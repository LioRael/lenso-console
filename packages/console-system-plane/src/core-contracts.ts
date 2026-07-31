/* eslint-disable func-style, no-use-before-define */

export const systemPlaneCoreProtocol = "lenso.system-plane.v1" as const;
export const systemPlaneCorePath = "/system-plane/v1" as const;
export const systemPlaneCoreDiscoveryFeature = "core-discovery" as const;

export interface CapabilityAdvertisement {
  contractId: string;
  majorVersion: number;
  featureIds: string[];
  schemaDigest: string;
  endpoint: string;
}

export interface CoreDocument {
  protocol: typeof systemPlaneCoreProtocol;
  serviceId: string;
  servicePrincipal: string;
  serviceRevision: string;
  capabilities: CapabilityAdvertisement[];
}

export class CoreContractError extends Error {
  readonly code = "system_plane_core_contract_invalid";

  constructor(message: string) {
    super(message);
    this.name = "CoreContractError";
  }
}

export function parseCoreDocument(value: unknown): CoreDocument {
  const record = exactRecord(
    value,
    ["protocol", "serviceId", "servicePrincipal", "serviceRevision"],
    ["capabilities"]
  );
  const capabilities = optionalArray(record.capabilities).map(parseCapability);
  const contracts = new Set<string>();
  for (const capability of capabilities) {
    if (contracts.has(capability.contractId)) {
      invalid(
        `capability ${capability.contractId} is advertised more than once`
      );
    }
    contracts.add(capability.contractId);
  }
  return {
    capabilities,
    protocol: literal(record.protocol, systemPlaneCoreProtocol, "protocol"),
    serviceId: nonEmptyString(record.serviceId, "serviceId"),
    servicePrincipal: nonEmptyString(
      record.servicePrincipal,
      "servicePrincipal"
    ),
    serviceRevision: nonEmptyString(record.serviceRevision, "serviceRevision"),
  };
}

function parseCapability(
  value: unknown,
  index: number
): CapabilityAdvertisement {
  const path = `capabilities[${index}]`;
  const record = exactRecord(
    value,
    ["contractId", "majorVersion", "schemaDigest", "endpoint"],
    ["featureIds"],
    path
  );
  const contractId = matchingString(
    record.contractId,
    /^lenso\.system-plane\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.v[1-9][0-9]*$/u,
    `${path}.contractId`
  );
  const majorVersion = positiveInteger(
    record.majorVersion,
    `${path}.majorVersion`
  );
  if (!contractId.endsWith(`.v${majorVersion}`)) {
    invalid(`${path}.majorVersion must match contractId`);
  }
  const featureIds = optionalArray(record.featureIds).map(
    (feature, featureIndex) =>
      matchingString(
        feature,
        /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u,
        `${path}.featureIds[${featureIndex}]`
      )
  );
  if (new Set(featureIds).size !== featureIds.length) {
    invalid(`${path}.featureIds must be unique`);
  }
  return {
    contractId,
    endpoint: matchingString(
      record.endpoint,
      /^\/system-plane\/v1\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/u,
      `${path}.endpoint`
    ),
    featureIds,
    majorVersion,
    schemaDigest: matchingString(
      record.schemaDigest,
      /^sha256:[0-9a-f]{64}$/u,
      `${path}.schemaDigest`
    ),
  };
}

function exactRecord(
  value: unknown,
  required: string[],
  optional: string[],
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

function optionalArray(value: unknown): unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    invalid("optional collection must be an array when present");
  }
  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    invalid(`${path} must be a non-empty string`);
  }
  return value;
}

function matchingString(value: unknown, pattern: RegExp, path: string): string {
  const result = nonEmptyString(value, path);
  if (!pattern.test(result)) {
    invalid(`${path} does not match the contract pattern`);
  }
  return result;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    invalid(`${path} must be a positive safe integer`);
  }
  return value as number;
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

function invalid(message: string): never {
  throw new CoreContractError(message);
}
