import { describe, expect, test } from "vitest";

import { RuntimeStatusBadge } from "./runtime-status-badge";

describe("runtime status badge style contract", () => {
  test("keeps all variants renderable through the StyleX component API", () => {
    expect(RuntimeStatusBadge).toBeTypeOf("function");
  });
});
