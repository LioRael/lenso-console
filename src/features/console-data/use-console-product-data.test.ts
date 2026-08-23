import { describe, expect, test } from "vitest";

import {
  type HomeEvidenceItem,
  mergeHomeEvidence,
  moduleRegistryRowFromArtifact,
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

describe("moduleRegistryRowFromArtifact", () => {
  test("keeps receipt-bound identity for the read-only Workbench", () => {
    const row = moduleRegistryRowFromArtifact({
      artifactDigest: `sha256:${"a".repeat(64)}`,
      basePath: "/artifacts/auth",
      entries: [{ name: "main", path: "index.js" }],
      entry: "index.js",
      format: "console_ui_esm",
      grantedPermissions: ["auth.users.read"],
      manifest: {
        consoleUi: "^2.0.0",
        hostApi: "^2.0.0",
        moduleId: "lenso/auth",
        protocol: "lenso.console-module.v1",
        surfaces: [
          {
            area: "operations",
            id: "auth-users",
            label: "Auth",
            path: "/auth",
            requiredCapabilities: ["auth.users.read"],
          },
        ],
      },
      moduleId: "lenso/auth",
      moduleReleaseDigest: `sha256:${"b".repeat(64)}`,
      protocolMajor: 1,
    });

    expect(row).toMatchObject({
      entry: "index.js",
      entryCount: 1,
      grantedPermissions: ["auth.users.read"],
      id: "lenso/auth",
      protocolMajor: 1,
    });
  });
});
