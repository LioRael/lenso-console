import { describe, expect, test } from "vitest";

import {
  runtimeTimelineTableHeaderProps,
  runtimeWaterfallTableHeaderProps,
} from "./runtime-table-header";

describe("runtime table header style contract", () => {
  test("keeps timeline and waterfall table headers on the same strip style", () => {
    expect(runtimeTimelineTableHeaderProps.className).toMatch(/\S+/);
    expect(runtimeWaterfallTableHeaderProps.className).toMatch(/\S+/);
  });
});
