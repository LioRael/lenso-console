/* eslint-disable func-style, no-use-before-define */

export const enrollmentOfferProtocol =
  "lenso.system-plane.enrollment-offer.v1" as const;
export const enrollmentReceiptProtocol =
  "lenso.system-plane.enrollment-receipt.v1" as const;

export interface EnrollmentCapabilityGrant {
  contractId: string;
  schemaDigest: string;
  featureIds: string[];
}

export interface EnrollmentPolicyGrant {
  policyId: string;
  policyRevision: string;
  policyDigest: string;
}

export interface EnrollmentSignature {
  algorithm: "ed25519";
  keyId: string;
  subjectDigest: string;
  value: string;
}

export interface EnrollmentOffer {
  protocol: typeof enrollmentOfferProtocol;
  systemId: string;
  consoleServicePrincipal: string;
  nonce: string;
  issuedAtUnixMs: number;
  expiresAtUnixMs: number;
  requestedCapabilities: EnrollmentCapabilityGrant[];
  requestedPolicy: EnrollmentPolicyGrant;
  signature: EnrollmentSignature;
}

export interface EnrollmentReceipt {
  protocol: typeof enrollmentReceiptProtocol;
  offerDigest: string;
  systemId: string;
  managedServiceId: string;
  managedServicePrincipal: string;
  managedServiceRevision: string;
  consoleServicePrincipal: string;
  nonce: string;
  issuedAtUnixMs: number;
  expiresAtUnixMs: number;
  grantRevision: number;
  authorizationEpoch: number;
  grantedCapabilities: EnrollmentCapabilityGrant[];
  grantedPolicy: EnrollmentPolicyGrant;
  signature: EnrollmentSignature;
}

export interface EnrollmentVerifyingKey {
  keyId: string;
  publicKey: Uint8Array;
}

export class EnrollmentContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EnrollmentContractError";
    this.code = code;
  }
}

export function parseEnrollmentOffer(value: unknown): EnrollmentOffer {
  const record = exactRecord(value, [
    "protocol",
    "systemId",
    "consoleServicePrincipal",
    "nonce",
    "issuedAtUnixMs",
    "expiresAtUnixMs",
    "requestedCapabilities",
    "requestedPolicy",
    "signature",
  ]);
  const offer: EnrollmentOffer = {
    protocol: literal(record.protocol, enrollmentOfferProtocol, "protocol"),
    systemId: nonEmpty(record.systemId, "systemId"),
    consoleServicePrincipal: nonEmpty(
      record.consoleServicePrincipal,
      "consoleServicePrincipal"
    ),
    nonce: minimumString(record.nonce, 16, "nonce"),
    issuedAtUnixMs: positiveInteger(record.issuedAtUnixMs, "issuedAtUnixMs"),
    expiresAtUnixMs: positiveInteger(record.expiresAtUnixMs, "expiresAtUnixMs"),
    requestedCapabilities: capabilities(
      record.requestedCapabilities,
      "requestedCapabilities"
    ),
    requestedPolicy: policy(record.requestedPolicy, "requestedPolicy"),
    signature: signature(record.signature),
  };
  if (offer.expiresAtUnixMs <= offer.issuedAtUnixMs) {
    invalid("enrollment_lifetime_invalid", "Offer expiry must follow issuance");
  }
  return offer;
}

export function parseEnrollmentReceipt(value: unknown): EnrollmentReceipt {
  const record = exactRecord(value, [
    "protocol",
    "offerDigest",
    "systemId",
    "managedServiceId",
    "managedServicePrincipal",
    "managedServiceRevision",
    "consoleServicePrincipal",
    "nonce",
    "issuedAtUnixMs",
    "expiresAtUnixMs",
    "grantRevision",
    "authorizationEpoch",
    "grantedCapabilities",
    "grantedPolicy",
    "signature",
  ]);
  return {
    protocol: literal(record.protocol, enrollmentReceiptProtocol, "protocol"),
    offerDigest: digest(record.offerDigest, "offerDigest"),
    systemId: nonEmpty(record.systemId, "systemId"),
    managedServiceId: nonEmpty(record.managedServiceId, "managedServiceId"),
    managedServicePrincipal: nonEmpty(
      record.managedServicePrincipal,
      "managedServicePrincipal"
    ),
    managedServiceRevision: nonEmpty(
      record.managedServiceRevision,
      "managedServiceRevision"
    ),
    consoleServicePrincipal: nonEmpty(
      record.consoleServicePrincipal,
      "consoleServicePrincipal"
    ),
    nonce: minimumString(record.nonce, 16, "nonce"),
    issuedAtUnixMs: positiveInteger(record.issuedAtUnixMs, "issuedAtUnixMs"),
    expiresAtUnixMs: positiveInteger(record.expiresAtUnixMs, "expiresAtUnixMs"),
    grantRevision: positiveInteger(record.grantRevision, "grantRevision"),
    authorizationEpoch: nonNegativeInteger(
      record.authorizationEpoch,
      "authorizationEpoch"
    ),
    grantedCapabilities: capabilities(
      record.grantedCapabilities,
      "grantedCapabilities"
    ),
    grantedPolicy: policy(record.grantedPolicy, "grantedPolicy"),
    signature: signature(record.signature),
  };
}

export async function enrollmentOfferDigest(
  offer: EnrollmentOffer
): Promise<string> {
  const { signature: _signature, ...unsigned } = offer;
  return sha256(JSON.stringify(unsigned));
}

export async function enrollmentReceiptDigest(
  receipt: EnrollmentReceipt
): Promise<string> {
  const { signature: _signature, ...unsigned } = receipt;
  return sha256(JSON.stringify(unsigned));
}

export async function verifyEnrollmentOffer(options: {
  offer: EnrollmentOffer;
  key: EnrollmentVerifyingKey;
  nowUnixMs?: number;
}): Promise<string> {
  const { offer, key } = options;
  if (offer.expiresAtUnixMs <= (options.nowUnixMs ?? Date.now())) {
    invalid("enrollment_offer_expired", "Enrollment Offer has expired");
  }
  const subjectDigest = await enrollmentOfferDigest(offer);
  await verifySignature(offer.signature, subjectDigest, key);
  return subjectDigest;
}

export async function verifyEnrollmentReceipt(options: {
  offer: EnrollmentOffer;
  receipt: EnrollmentReceipt;
  key: EnrollmentVerifyingKey;
  nowUnixMs?: number;
}): Promise<string> {
  const { offer, receipt, key } = options;
  const expectedOfferDigest = await enrollmentOfferDigest(offer);
  if (
    receipt.offerDigest !== expectedOfferDigest ||
    receipt.systemId !== offer.systemId ||
    receipt.consoleServicePrincipal !== offer.consoleServicePrincipal ||
    receipt.nonce !== offer.nonce
  ) {
    invalid(
      "enrollment_receipt_offer_mismatch",
      "Enrollment Receipt is not bound to the exact Offer"
    );
  }
  const now = options.nowUnixMs ?? Date.now();
  if (
    receipt.issuedAtUnixMs < offer.issuedAtUnixMs ||
    receipt.expiresAtUnixMs > offer.expiresAtUnixMs ||
    receipt.expiresAtUnixMs <= now
  ) {
    invalid(
      "enrollment_receipt_lifetime_invalid",
      "Enrollment Receipt lifetime is invalid"
    );
  }
  if (!samePolicy(receipt.grantedPolicy, offer.requestedPolicy)) {
    invalid(
      "enrollment_receipt_policy_widened",
      "Enrollment Receipt substituted the requested policy"
    );
  }
  for (const granted of receipt.grantedCapabilities) {
    const requested = offer.requestedCapabilities.find(
      (item) =>
        item.contractId === granted.contractId &&
        item.schemaDigest === granted.schemaDigest
    );
    if (
      !requested ||
      granted.featureIds.some(
        (featureId) => !requested.featureIds.includes(featureId)
      )
    ) {
      invalid(
        "enrollment_receipt_capability_widened",
        "Enrollment Receipt widened the requested capabilities"
      );
    }
  }
  const subjectDigest = await enrollmentReceiptDigest(receipt);
  await verifySignature(receipt.signature, subjectDigest, key);
  return subjectDigest;
}

async function verifySignature(
  signatureValue: EnrollmentSignature,
  subjectDigest: string,
  key: EnrollmentVerifyingKey
): Promise<void> {
  if (
    signatureValue.keyId !== key.keyId ||
    signatureValue.subjectDigest !== subjectDigest
  ) {
    invalid(
      "enrollment_signature_binding_invalid",
      "Enrollment signature identity or subject digest does not match"
    );
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(key.publicKey),
    "Ed25519",
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "Ed25519",
    cryptoKey,
    arrayBuffer(decodeBase64Url(signatureValue.value)),
    new TextEncoder().encode(subjectDigest)
  );
  if (!valid) {
    invalid("enrollment_signature_invalid", "Enrollment signature is invalid");
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return `sha256:${[...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function capabilities(
  value: unknown,
  path: string
): EnrollmentCapabilityGrant[] {
  if (!Array.isArray(value)) {
    invalid("enrollment_contract_invalid", `${path} must be an array`);
  }
  const parsed = value.map((item, index) =>
    capability(item, `${path}[${index}]`)
  );
  if (
    new Set(parsed.map((item) => item.contractId)).size !== parsed.length ||
    parsed.some(
      (item, index) =>
        index > 0 && parsed[index - 1]!.contractId >= item.contractId
    )
  ) {
    invalid(
      "enrollment_capabilities_not_canonical",
      `${path} must be unique and sorted by contractId`
    );
  }
  return parsed;
}

function capability(value: unknown, path: string): EnrollmentCapabilityGrant {
  const record = exactRecord(
    value,
    ["contractId", "schemaDigest", "featureIds"],
    path
  );
  if (!Array.isArray(record.featureIds)) {
    invalid(
      "enrollment_contract_invalid",
      `${path}.featureIds must be an array`
    );
  }
  const featureIds = record.featureIds.map((item, index) =>
    matchingString(
      item,
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
      `${path}.featureIds[${index}]`
    )
  );
  if (new Set(featureIds).size !== featureIds.length) {
    invalid("enrollment_contract_invalid", `${path}.featureIds must be unique`);
  }
  return {
    contractId: matchingString(
      record.contractId,
      /^lenso\.system-plane\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.v[1-9][0-9]*$/u,
      `${path}.contractId`
    ),
    schemaDigest: digest(record.schemaDigest, `${path}.schemaDigest`),
    featureIds,
  };
}

function policy(value: unknown, path: string): EnrollmentPolicyGrant {
  const record = exactRecord(
    value,
    ["policyId", "policyRevision", "policyDigest"],
    path
  );
  return {
    policyId: nonEmpty(record.policyId, `${path}.policyId`),
    policyRevision: nonEmpty(record.policyRevision, `${path}.policyRevision`),
    policyDigest: digest(record.policyDigest, `${path}.policyDigest`),
  };
}

function signature(value: unknown): EnrollmentSignature {
  const record = exactRecord(
    value,
    ["algorithm", "keyId", "subjectDigest", "value"],
    "signature"
  );
  return {
    algorithm: literal(record.algorithm, "ed25519", "signature.algorithm"),
    keyId: nonEmpty(record.keyId, "signature.keyId"),
    subjectDigest: digest(record.subjectDigest, "signature.subjectDigest"),
    value: matchingString(
      record.value,
      /^[A-Za-z0-9_-]{86}$/u,
      "signature.value"
    ),
  };
}

function samePolicy(
  left: EnrollmentPolicyGrant,
  right: EnrollmentPolicyGrant
): boolean {
  return (
    left.policyId === right.policyId &&
    left.policyRevision === right.policyRevision &&
    left.policyDigest === right.policyDigest
  );
}

function exactRecord(
  value: unknown,
  fields: string[],
  path = "document"
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("enrollment_contract_invalid", `${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== fields.length ||
    fields.some((field) => !(field in record))
  ) {
    invalid(
      "enrollment_contract_invalid",
      `${path} fields do not match the contract`
    );
  }
  return record;
}

function nonEmpty(value: unknown, path: string): string {
  return minimumString(value, 1, path);
}

function minimumString(value: unknown, minimum: number, path: string): string {
  if (typeof value !== "string" || value.length < minimum) {
    invalid("enrollment_contract_invalid", `${path} is invalid`);
  }
  return value;
}

function matchingString(value: unknown, pattern: RegExp, path: string): string {
  const result = nonEmpty(value, path);
  if (!pattern.test(result)) {
    invalid("enrollment_contract_invalid", `${path} is invalid`);
  }
  return result;
}

function digest(value: unknown, path: string): string {
  return matchingString(value, /^sha256:[0-9a-f]{64}$/u, path);
}

function positiveInteger(value: unknown, path: string): number {
  const result = nonNegativeInteger(value, path);
  if (result < 1) {
    invalid("enrollment_contract_invalid", `${path} must be positive`);
  }
  return result;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(
      "enrollment_contract_invalid",
      `${path} must be a non-negative safe integer`
    );
  }
  return value as number;
}

function literal<const T extends string>(
  value: unknown,
  expected: T,
  path: string
): T {
  if (value !== expected) {
    invalid("enrollment_contract_invalid", `${path} must equal ${expected}`);
  }
  return expected;
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(`${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`);
  return Uint8Array.from(decoded, (character) => character.codePointAt(0) ?? 0);
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}

function invalid(code: string, message: string): never {
  throw new EnrollmentContractError(code, message);
}
