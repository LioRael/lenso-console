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
  test("shows repeated runtime evidence once when streams overlap", () => {
    const primary = evidence(
      "runtime_req_1",
      "2026-08-01T12:00:00Z",
      "runtime · verified"
    );
    const runtime = evidence("runtime_req_1", "2026-08-01T12:00:00Z");

    expect(mergeHomeEvidence([primary], [runtime])).toEqual([primary]);
  });

  test("keeps distinct runtime evidence and orders the merged stream", () => {
    const primary = evidence("runtime_req_1", "2026-08-01T12:00:00Z");
    const event = evidence("evt_1", "2026-08-01T12:01:00Z");

    expect(mergeHomeEvidence([primary], [event])).toEqual([event, primary]);
  });
});
