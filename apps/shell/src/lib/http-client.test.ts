import { describe, expect, test } from "vitest";

import { consoleApiPrefix, lensoApiErrorMessage } from "./http-client";

describe("consoleApiPrefix", () => {
  test("keeps hosted Console requests origin-rooted", () => {
    expect(consoleApiPrefix("/")).toBe("/");
    expect(consoleApiPrefix("http://localhost:3000/")).toBe(
      "http://localhost:3000"
    );
    expect(consoleApiPrefix("")).toBeUndefined();
  });
});

describe("lensoApiErrorMessage", () => {
  test("extracts standard API error messages", () => {
    expect(lensoApiErrorMessage({ detail: "Agent runtime unavailable" })).toBe(
      "Agent runtime unavailable"
    );
  });

  test("ignores unknown error bodies", () => {
    expect(lensoApiErrorMessage({ message: "Failed" })).toBeUndefined();
  });
});
