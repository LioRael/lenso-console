import { describe, expect, test } from "vitest";

import {
  type HomeEvidenceItem,
  mergeHomeEvidence,
} from "./use-console-product-data";

function evidence(
  id: string,
  occurredAt: string,
  detail = "runtime"
): HomeEvidenceItem {
  return {
    detail,
    id,
    occurredAt,
    title: id,
    tone: "success",
  };
}

describe("mergeHomeEvidence", () => {
  test("shows an admin action once when runtime summary contains the same invocation", () => {
    const action = evidence(
      "adminaction_req_1",
      "2026-08-01T12:00:00Z",
      "auth · verified"
    );
    const runtime = evidence("adminaction_req_1", "2026-08-01T12:00:00Z");

    expect(mergeHomeEvidence([action], [runtime])).toEqual([action]);
  });

  test("keeps distinct runtime evidence and orders the merged stream", () => {
    const action = evidence("adminaction_req_1", "2026-08-01T12:00:00Z");
    const event = evidence("evt_1", "2026-08-01T12:01:00Z");

    expect(mergeHomeEvidence([action], [event])).toEqual([event, action]);
  });
});
