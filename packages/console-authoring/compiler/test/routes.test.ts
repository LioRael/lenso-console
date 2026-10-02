import { test, expect } from "bun:test";

import { match } from "../router";

test("catch-all parameters are bounded by their route shape", () => {
  expect(match(["docs", "[...slug]"], ["docs", "a", "b"])).toEqual({
    slug: ["a", "b"],
  });
  expect(match(["docs", "[...slug]"], ["docs"])).toBeNull();
  expect(match(["docs", "[[...slug]]"], ["docs"])).toEqual({ slug: [] });
  expect(match(["orders", "[id]"], ["orders", "42", "extra"])).toBeNull();
});
