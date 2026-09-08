import { expect, test } from "vitest";

import { speedMenu } from "./agent-speed";

const model = {
  providerId: "chatgpt",
  displayName: "Test",
  id: "test",
  hidden: false,
  selected: true,
  reasoningEfforts: [],
  serviceTiers: ["fast", "priority"],
};

test("Codex aliases share one Fast option and preserve an admitted wire value", () => {
  expect(speedMenu(model, "priority")).toEqual({
    options: [
      { label: "Default", value: "" },
      { label: "Fast", value: "fast" },
    ],
    value: "fast",
  });
  expect(speedMenu({ ...model, serviceTiers: ["priority"] }, "fast")).toEqual({
    options: [
      { label: "Default", value: "" },
      { label: "Fast", value: "priority" },
    ],
    value: "priority",
  });
});

test("default configuration is distinct from explicit standard processing", () => {
  expect(speedMenu(model).value).toBe("");
  expect(
    speedMenu({ ...model, serviceTiers: ["default", "fast"] }, "default")
  ).toEqual({
    options: [
      { label: "Default", value: "" },
      { label: "Standard", value: "default" },
      { label: "Fast", value: "fast" },
    ],
    value: "default",
  });
});

test("unsupported controls are hidden and other providers retain distinct tiers", () => {
  expect(speedMenu({ ...model, serviceTiers: [] }).options).toEqual([]);
  expect(speedMenu({ ...model, providerId: "other" }).options).toEqual([
    { label: "Default", value: "" },
    { label: "fast", value: "fast" },
    { label: "priority", value: "priority" },
  ]);
});
