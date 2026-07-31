import { describe, expect, it } from "vitest";

import {
  CoreContractError,
  parseCoreDocument,
  systemPlaneCoreProtocol,
} from "./core-contracts.js";

const capability = {
  contractId: "lenso.system-plane.runtime-observability.v1",
  endpoint: "/system-plane/v1/runtime-observability",
  featureIds: ["queue-summary", "recovery-feed"],
  majorVersion: 1,
  schemaDigest: `sha256:${"b".repeat(64)}`,
};

const document = {
  capabilities: [capability],
  protocol: systemPlaneCoreProtocol,
  serviceId: "support",
  servicePrincipal: "service:support",
  serviceRevision: "release:one",
};

describe("parseCoreDocument", () => {
  it("accepts the exact generated Core contract", () => {
    expect(parseCoreDocument(document)).toEqual(document);
  });

  it("rejects undeclared fields and duplicate contract advertisements", () => {
    expect(() =>
      parseCoreDocument({ ...document, displayName: "Support" })
    ).toThrow(CoreContractError);
    expect(() =>
      parseCoreDocument({
        ...document,
        capabilities: [capability, capability],
      })
    ).toThrow("advertised more than once");
  });

  it("rejects a major version that disagrees with the contract identifier", () => {
    expect(() =>
      parseCoreDocument({
        ...document,
        capabilities: [{ ...capability, majorVersion: 2 }],
      })
    ).toThrow("majorVersion must match contractId");
  });
});
