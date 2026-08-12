import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  type ExecutionLogEntry,
  runtimeStories,
} from "../../data/mock-runtime";
import { LogList } from "./execution-inspector";

const story = runtimeStories[0]!;
const logs: ExecutionLogEntry[] = [
  {
    attributes: {},
    body: "Local checkout completed",
    correlationId: story.correlationId,
    executionName: "checkout",
    id: "log-local",
    nodeId: story.nodes[0]!.id,
    nodeType: story.nodes[0]!.kind,
    occurredAt: story.timestamp,
    redactedFields: [],
    serviceName: "orders",
    severity: "info",
    storyId: story.id,
  },
  {
    attributes: {},
    body: "Payment request accepted",
    correlationId: story.correlationId,
    executionName: "checkout",
    id: "log-payment",
    nodeId: story.nodes[0]!.id,
    nodeType: story.nodes[0]!.kind,
    occurredAt: story.timestamp,
    redactedFields: [],
    serviceName: "orders",
    severity: "info",
    storyId: story.id,
  },
];

describe("execution log list", () => {
  test("renders available entries and coverage evidence without counting gaps as logs", () => {
    const markup = renderToStaticMarkup(
      <LogList
        coverage={{
          gaps: [
            {
              detail: "Billing execution logs timed out",
              kind: "source_unavailable",
              nextAction: "Restore the billing execution log source.",
              sourceId: "billing-runtime",
            },
            {
              detail: "Audit export is paused",
              kind: "source_unavailable",
              sourceId: "audit-runtime",
            },
          ],
          sources: [
            {
              serviceName: "orders",
              sourceId: "orders-runtime",
              status: "complete",
            },
            {
              serviceName: "billing",
              sourceId: "billing-runtime",
              status: "unavailable",
            },
            {
              serviceName: "audit",
              sourceId: "audit-runtime",
              status: "unavailable",
            },
          ],
          status: "partial",
        }}
        isError={false}
        isLoading={false}
        logs={logs}
        story={story}
      />
    );

    expect(markup).toContain("Some log sources could not be read");
    expect(markup).toContain("2 entries");
    expect(markup).not.toContain("3 entries");
    expect(markup).toContain("Local checkout completed");
    expect(markup).toContain("Payment request accepted");
    expect(markup).toContain("1 of 3 log sources available.");
    expect(markup).toContain(
      "billing (billing-runtime): Billing execution logs timed out"
    );
    expect(markup).toContain("audit (audit-runtime): Audit export is paused");
    expect(markup).toContain("Restore the billing execution log source.");
  });

  test("renders a fixed generic transport error", () => {
    const markup = renderToStaticMarkup(
      <LogList
        coverage={undefined}
        isError
        isLoading={false}
        logs={[]}
        story={story}
      />
    );

    expect(markup).toContain("Execution logs could not be loaded.");
  });
});
