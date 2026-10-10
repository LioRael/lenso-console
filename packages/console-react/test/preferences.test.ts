import { expect, test } from "bun:test";

import { projectConsolePreferenceSnapshot } from "../src/console-preferences";

// Existing ordering tests use typed preferences; they cannot catch transport
// objects carrying secrets/components into the next preference save.
test("preference transport keeps only stable references and distinguishes absent from empty", () => {
  const result = projectConsolePreferenceSnapshot({
    revision: "1",
    value: {
      mode: "dock",
      position: "bottom",
      pinned: [
        {
          bindingId: "orders.primary",
          navigationId: "orders",
          title: "Discard this metadata",
        },
      ],
      privateValue: "test-only-field",
    },
  });
  expect(result.value).toEqual({
    mode: "dock",
    position: "bottom",
    pinned: [{ bindingId: "orders.primary", navigationId: "orders" }],
  });
  expect(
    projectConsolePreferenceSnapshot({ revision: "0", value: null }).value
  ).toBeNull();
  expect(
    projectConsolePreferenceSnapshot({
      revision: "2",
      value: { mode: "dock", position: "bottom", pinned: [] },
    }).value?.pinned
  ).toEqual([]);
  expect(() =>
    projectConsolePreferenceSnapshot({
      revision: "2",
      value: { mode: "unrecognized", position: "bottom", pinned: [] },
    })
  ).toThrow();
});
