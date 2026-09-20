import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import type { AgentTrajectory as AgentTrajectoryData } from "./agent-runtime";
import { AgentTrajectory } from "./agent-trajectory";

let root: Root;
let container: HTMLDivElement;

const trajectory: AgentTrajectoryData = {
  records: [
    {
      detail: { summary: "Read the current Plugin state." },
      durationMs: 120,
      id: "event-read",
      kind: "model",
      label: "Inspect configuration",
      preview: "Read desired and active Generations",
      sourceEventIds: ["session-event-1"],
      startedAt: "2026-09-20T00:00:00Z",
      status: "completed",
      turn: 1,
    },
    {
      detail: {
        summary: "The Host accepted a configuration publication.",
        toolCallId: "call-publish",
      },
      durationMs: 240,
      id: "event-publish",
      kind: "tool",
      label: "Publish configuration",
      preview: "Publication receipt recorded",
      sourceEventIds: ["session-event-2", "session-event-3"],
      startedAt: "2026-09-20T00:00:01Z",
      status: "completed",
      turn: 2,
    },
  ],
  revision: 7,
  schema: "lenso.agent.trajectory@1",
  sessionId: "session-support-1",
  summary: {
    failedOperations: 0,
    inputTokens: 0,
    modelCalls: 1,
    outputTokens: 0,
    status: "completed",
    toolCalls: 1,
    turns: 2,
  },
};

beforeEach(() => {
  container = document.createElement("div");
  container.style.cssText = "height: 600px; width: 900px";
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root.render(
      <ThemeScope>
        <AgentTrajectory
          owner={{ id: "support", label: "Support Agent" }}
          trajectory={trajectory}
        />
      </ThemeScope>
    )
  );
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
});

test("filters whole trajectory groups and attributes selected evidence to its Agent Session", async () => {
  await expect
    .element(page.getByText("Agent · Support Agent", { exact: true }))
    .toBeVisible();

  await page
    .getByRole("searchbox", { name: "Search trajectory" })
    .fill("publish");
  await expect
    .element(page.getByRole("button", { name: /Turn 2/u }))
    .toBeVisible();
  expect(page.getByRole("button", { name: /Turn 1/u }).elements()).toHaveLength(
    0
  );

  const record = page.getByRole("button", { name: /Publish configuration/u });
  record.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(
      page.getByRole("complementary", { name: "Trajectory record details" })
    )
    .toBeVisible();
  await expect
    .element(page.getByText("Support Agent · support", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("session-support-1", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("7", { exact: true })).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Search trajectory" })
    .fill("absent");
  await expect
    .element(page.getByText("No trajectory records match this filter."))
    .toBeVisible();
  expect(page.getByRole("button", { name: /Turn 2/u }).elements()).toHaveLength(
    0
  );
  await page.getByRole("button", { name: "Clear trajectory search" }).click();
  await expect
    .element(page.getByRole("button", { name: /Turn 1/u }))
    .toBeVisible();
});
