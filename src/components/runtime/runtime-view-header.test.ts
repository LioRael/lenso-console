import { describe, expect, test } from "vitest";

import {
  runtimeViewHeaderProps,
  runtimeViewHeaderContentProps,
  runtimeViewHeaderLabelProps,
  runtimeViewHeaderMetaProps,
  runtimeViewHeaderSummaryProps,
} from "./runtime-view-header";

describe("runtime view header style contract", () => {
  test("uses one shared style contract for runtime tab titles", () => {
    expect(runtimeViewHeaderProps.className).toMatch(/\S+/);
    expect(runtimeViewHeaderProps.className).not.toContain("border-b");
    expect(runtimeViewHeaderProps.className).not.toContain("bg-(--bg-surface)");
    expect(runtimeViewHeaderContentProps.className).toMatch(/\S+/);
    expect(runtimeViewHeaderLabelProps.className).toMatch(/\S+/);
    expect(runtimeViewHeaderSummaryProps.className).toMatch(/\S+/);
    expect(runtimeViewHeaderMetaProps.className).toMatch(/\S+/);
  });
});
