import { describe, expect, test } from "vitest";

import { lensoApiErrorMessage, runtimeConsoleApiPrefix } from "./http-client";

describe("runtimeConsoleApiPrefix", () => {
  test("keeps hosted console requests origin-rooted", () => {
    expect(runtimeConsoleApiPrefix("/")).toBe("/");
    expect(runtimeConsoleApiPrefix("http://localhost:3000/")).toBe(
      "http://localhost:3000"
    );
    expect(runtimeConsoleApiPrefix("")).toBeUndefined();
  });
});

describe("lensoApiErrorMessage", () => {
  test("extracts standard API error messages", () => {
    expect(
      lensoApiErrorMessage({
        error: {
          code: "forbidden",
          message: "missing console admin scope: console.admin",
        },
      })
    ).toBe("missing console admin scope: console.admin");
  });

  test("ignores unknown error bodies", () => {
    expect(lensoApiErrorMessage({ message: "Forbidden" })).toBeUndefined();
  });
});
