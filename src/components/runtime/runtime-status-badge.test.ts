import { describe, expect, test } from "vitest";

import {
  runtimeStatusBadgeBaseClassName,
  runtimeStatusBadgeLabelClassName,
  runtimeStatusBadgeTableClassName,
} from "./runtime-status-badge";

describe("runtime status badge style contract", () => {
  test("keeps the label variant aligned with inspector header labels", () => {
    expect(runtimeStatusBadgeBaseClassName).toContain("rounded-full");
    expect(runtimeStatusBadgeBaseClassName).toContain("font-medium");
    expect(runtimeStatusBadgeLabelClassName).toContain("py-0.5");
    expect(runtimeStatusBadgeLabelClassName).not.toContain("uppercase");
    expect(runtimeStatusBadgeLabelClassName).not.toContain("shadow");
    expect(runtimeStatusBadgeTableClassName).toContain("w-[72px]");
  });
});
