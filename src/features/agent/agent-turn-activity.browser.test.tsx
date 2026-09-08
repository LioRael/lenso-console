import { ThemeScope } from "@lenso/ui/theme-scope";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { AgentForkButton } from "./agent-fork-button";
import type { AgentTurn } from "./agent-runtime";
import { AgentTurnActivity } from "./agent-turn-activity";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const turn: AgentTurn = {
  id: "t",
  user: "hello",
  answer: "Final answer",
  thought: "",
  status: "completed",
  work: { durationMs: 2500 },
  activity: [
    { kind: "text", text: "Checking the file" },
    { kind: "tool", callId: "c" },
  ],
  tools: [
    {
      callId: "c",
      name: "read_file",
      argumentsJson: '{"path":"src/app.ts"}',
      resultContent: "actual file output",
      status: "completed",
    },
  ],
};
test("completed work is collapsed, with ordered text and real output behind disclosure", async () => {
  flushSync(() =>
    root.render(
      <ThemeScope>
        <AgentTurnActivity turn={turn} />
      </ThemeScope>
    )
  );
  expect(container.querySelector("details")?.open).toBe(false);
  await page.getByText("Worked for 2s").click();
  await expect.element(page.getByText("Checking the file")).toBeVisible();
  await page.getByText("Completed · read_file · src/app.ts").click();
  await expect.element(page.getByText("actual file output")).toBeVisible();
  flushSync(() =>
    root.render(
      <ThemeScope>
        <AgentTurnActivity turn={{ ...turn, work: { durationMs: 3000 } }} />
      </ThemeScope>
    )
  );
  expect(container.querySelector("details")?.open).toBe(true);
});
test("failed activity remains expanded", () => {
  flushSync(() =>
    root.render(
      <ThemeScope>
        <AgentTurnActivity turn={{ ...turn, status: "failed" }} />
      </ThemeScope>
    )
  );
  expect(container.querySelector("details")?.open).toBe(true);
});
test("fork retry reuses the operation and only navigates after success", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("Temporary failure", { status: 503 }))
    .mockResolvedValueOnce(
      Response.json({ sessionId: "branch" }, { status: 200 })
    );
  vi.stubGlobal("fetch", fetchMock);
  const onFork = vi.fn();
  flushSync(() =>
    root.render(
      <ThemeScope>
        <AgentForkButton
          target={{
            sessionId: "source",
            turnId: "t",
            targetId: "console",
            onFork,
          }}
        />
      </ThemeScope>
    )
  );
  await page.getByRole("button", { name: "Branch to new chat" }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  expect(onFork).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Branch to new chat" }).click();
  await expect.poll(() => onFork.mock.calls.length).toBe(1);
  expect(onFork).toHaveBeenCalledWith("branch");
  expect(fetchMock.mock.calls[0]?.[1].body).toBe(
    fetchMock.mock.calls[1]?.[1].body
  );
});
