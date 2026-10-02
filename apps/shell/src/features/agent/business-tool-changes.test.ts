import { expect, test } from "vitest";

import type { AgentToolCall } from "./agent-runtime";
import { businessToolChanges } from "./business-tool-changes";

test("only an exact recorded pre-read produces a change summary", () => {
  const before = {
    organization_id: "org",
    issue_id: "issue",
    title: "Old",
    priority: "medium",
    revision: "1",
  };
  const read: AgentToolCall = {
    callId: "read",
    name: "projects_get_issue",
    status: "completed",
    resultContent: JSON.stringify(before),
  };
  const update: AgentToolCall = {
    callId: "update",
    name: "projects_update_issue",
    status: "completed",
    argumentsJson: JSON.stringify({ expected_revision: "1" }),
    resultContent: JSON.stringify({ ...before, title: "New", revision: "2" }),
  };
  expect(businessToolChanges(update, [read, update])).toEqual([
    { label: "Title", before: "Old", after: "New" },
  ]);
  expect(businessToolChanges(update, [update])).toEqual([]);
  expect(
    businessToolChanges({ ...update, status: "failed" }, [read, update])
  ).toEqual([]);
  expect(
    businessToolChanges(update, [{ ...read, resultTruncated: true }, update])
  ).toEqual([]);
  expect(
    businessToolChanges(update, [
      { ...read, resultContent: JSON.stringify({ ...before, revision: "0" }) },
      update,
    ])
  ).toEqual([]);
});
