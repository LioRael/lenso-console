import { describe, expect, test } from "vitest";

import { consoleApiPrefix, lensoApiErrorMessage } from "./http-client";

describe("consoleApiPrefix", () => {
  test("keeps hosted console requests origin-rooted", () => {
    expect(consoleApiPrefix("/")).toBe("/");
    expect(consoleApiPrefix("http://localhost:3000/")).toBe(
      "http://localhost:3000"
    );
    expect(consoleApiPrefix("")).toBeUndefined();
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
