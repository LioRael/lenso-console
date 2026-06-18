import { describe, expect, test } from "vitest";

import { runtimeConsoleApiPrefix } from "./http-client";

describe("runtimeConsoleApiPrefix", () => {
  test("keeps hosted console requests origin-rooted", () => {
    expect(runtimeConsoleApiPrefix("/")).toBe("/");
    expect(runtimeConsoleApiPrefix("http://localhost:3000/")).toBe(
      "http://localhost:3000"
    );
    expect(runtimeConsoleApiPrefix("")).toBeUndefined();
  });
});
