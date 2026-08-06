import { describe, expect, test } from "vitest";

import {
  runtimeViewHeaderClassName,
  runtimeViewHeaderContentClassName,
  runtimeViewHeaderLabelClassName,
  runtimeViewHeaderMetaClassName,
  runtimeViewHeaderSummaryClassName,
} from "./runtime-view-header";

describe("runtime view header style contract", () => {
  test("uses one shared style contract for runtime tab titles", () => {
    expect(runtimeViewHeaderClassName).toMatch(/\S+/);
    expect(runtimeViewHeaderClassName).not.toContain("border-b");
    expect(runtimeViewHeaderClassName).not.toContain("bg-(--bg-surface)");
    expect(runtimeViewHeaderContentClassName).toMatch(/\S+/);
    expect(runtimeViewHeaderLabelClassName).toMatch(/\S+/);
    expect(runtimeViewHeaderSummaryClassName).toMatch(/\S+/);
    expect(runtimeViewHeaderMetaClassName).toMatch(/\S+/);
  });
});
