import { describe, expect, test } from "vitest";

import {
  runtimeTableHeaderBaseClassName,
  runtimeTimelineTableHeaderClassName,
  runtimeWaterfallTableHeaderClassName,
} from "./runtime-table-header";

describe("runtime table header style contract", () => {
  test("keeps timeline and waterfall table headers on the same strip style", () => {
    expect(runtimeTableHeaderBaseClassName).toMatch(/\S+/);
    expect(runtimeTableHeaderBaseClassName).not.toContain("border-b");
    expect(runtimeTableHeaderBaseClassName).not.toContain(
      "bg-(--bg-surface-muted)"
    );
    expect(runtimeTimelineTableHeaderClassName).toContain(
      runtimeTableHeaderBaseClassName
    );
    expect(runtimeWaterfallTableHeaderClassName).toContain(
      runtimeTableHeaderBaseClassName
    );
  });
});
