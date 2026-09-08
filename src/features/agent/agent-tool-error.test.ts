import { expect, test } from "vitest";

import { toolErrorDetails } from "./agent-tool-error";

test("unwraps legacy errors without leaking escaped debug objects into the summary", () => {
  const details = JSON.stringify({
    exit_code: "129",
    stderr: "warning: Not a git repository.\nusage: git diff\n",
  });
  const raw = `Domain(ToolError { payload: ErrorPayload { details_json: RawJson(${JSON.stringify(details)}), message: "Git rejected the requested operation." } })`;
  expect(toolErrorDetails(raw)).toEqual({
    summary: "warning: Not a git repository.",
    output: "warning: Not a git repository.\nusage: git diff\n",
    exitCode: "129",
  });
});
test("keeps unstructured errors inspectable and bounds their summary", () => {
  const raw = `Unexpected failure\n${"x".repeat(5000)}`;
  expect(toolErrorDetails(raw)).toEqual({
    summary: "Unexpected failure",
    output: raw,
  });
  expect(toolErrorDetails("Domain(broken)").summary).toBe(
    "The tool could not complete this operation."
  );
});

test("recovers stderr from a truncated legacy wrapper", () => {
  const raw = `Domain(ToolError { details_json: RawJson(${JSON.stringify(JSON.stringify({ exit_code: "129", stderr: `warning: Not a git repository.\n${  "usage ".repeat(1000)}` }))}) })`;
  expect(toolErrorDetails(raw.slice(0, 500))).toMatchObject({
    summary: "warning: Not a git repository.",
    exitCode: "129",
  });
});
