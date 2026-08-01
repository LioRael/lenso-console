import { describe, expect, test } from "vitest";

import {
  runtimeTableHeaderBaseClassName,
  runtimeTimelineTableHeaderClassName,
  runtimeWaterfallTableHeaderClassName,
} from "./runtime-table-header";

describe("runtime table header style contract", () => {
  test("keeps timeline and waterfall table headers on the same strip style", () => {
    expect(runtimeTableHeaderBaseClassName).toContain("border-b");
    expect(runtimeTableHeaderBaseClassName).toContain("bg-(--bg-panel-header)");
    expect(runtimeTableHeaderBaseClassName).toContain("px-3");
    expect(runtimeTableHeaderBaseClassName).toContain("h-7");
    expect(runtimeTimelineTableHeaderClassName).toContain(
      runtimeTableHeaderBaseClassName
    );
    expect(runtimeWaterfallTableHeaderClassName).toContain(
      runtimeTableHeaderBaseClassName
    );
  });
});
