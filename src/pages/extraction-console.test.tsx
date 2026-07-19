import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ExtractionConsolePanel,
  type ExtractionConsoleProjection,
} from "./extraction-console";

const projection: ExtractionConsoleProjection = {
  protocol: "lenso.extraction-console.v1",
  projectionDigest: "sha256:projection",
  state: "rolled_back",
  planId: "plan:support",
  readinessSummary: "Extraction readiness passed with no blocking findings.",
  currentAuthority: {
    kind: "linked_host",
    ownerId: "support-host",
    revision: "authority-r7",
  },
  timeline: [
    {
      phaseId: "08-provisional-cutover",
      kind: "cutover",
      state: "rolled_back",
      artifactId: "cutover:failed",
    },
  ],
  blockers: [
    {
      code: "candidate_unhealthy",
      subject: "support-ticket-service",
      detail: "candidate returned 503",
      nextActions: ["repair candidate health"],
      artifactId: "cutover:failed",
    },
  ],
  evidence: [
    {
      kind: "rollback",
      subject: "operator:alice",
      digest: "sha256:rollback",
      detail: "linked routing restored",
      artifactId: "cutover:failed",
    },
  ],
  approvalBoundaries: [],
  readOnly: true,
  applyActions: [],
  protectedWorkflow: "lenso service extract",
};

describe("extraction console", () => {
  it("renders backend-projected rollback, blockers, provenance and protected workflow", () => {
    const html = renderToStaticMarkup(
      <ExtractionConsolePanel data={projection} />
    );
    expect(html).toContain("rolled back");
    expect(html).toContain("candidate_unhealthy");
    expect(html).toContain("linked routing restored");
    expect(html).toContain("lenso service extract");
    expect(html).toContain('aria-label="Extraction phase timeline"');
    expect(html).not.toContain("Apply Cutover");
  });
  it("has explicit empty and error states", () => {
    expect(renderToStaticMarkup(<ExtractionConsolePanel />)).toContain(
      "No extraction plan"
    );
    expect(
      renderToStaticMarkup(<ExtractionConsolePanel error="HTTP 503" />)
    ).toContain('role="alert"');
  });
});
