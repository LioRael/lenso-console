import { expect, test } from "vitest";

import {
  consoleReadRefreshPolicy,
  parseConsoleReadRefreshConfiguration,
} from "./read-refresh-policy";

// Public build configuration must inherit missing fields without changing identity
// or silently accepting a misspelled policy. SDK-only tests do not decode this input.
test("global and mount configuration inherit per field and preserve host defaults", () => {
  expect(consoleReadRefreshPolicy(undefined, {})).toEqual({
    focus: "never",
    staleTimeMs: 10_000,
  });
  const settings = parseConsoleReadRefreshConfiguration({
    defaults: { focus: "stale", staleTimeMs: 30_000 },
    mounts: {
      "keys-alpha": { focus: "always" },
      "keys-beta": { staleTimeMs: 0 },
    },
  });
  expect(consoleReadRefreshPolicy("keys-alpha", settings)).toEqual({
    focus: "always",
    staleTimeMs: 30_000,
  });
  expect(consoleReadRefreshPolicy("keys-beta", settings)).toEqual({
    focus: "stale",
    staleTimeMs: 0,
  });
  expect(consoleReadRefreshPolicy("other", settings)).toEqual({
    focus: "stale",
    staleTimeMs: 30_000,
  });
  expect(consoleReadRefreshPolicy("constructor", settings)).toEqual({
    focus: "stale",
    staleTimeMs: 30_000,
  });
});

test("invalid public configuration fails explicitly rather than selecting another refresh policy", () => {
  for (const value of [
    null,
    [],
    { default: {} },
    { defaults: { focus: "sometimes" } },
    { defaults: { staleTimeMs: -1 } },
    { defaults: { staleTimeMs: "1000" } },
    { defaults: { staleTimeMs: Number.NaN } },
    { defaults: { staleTimeMs: Number.POSITIVE_INFINITY } },
    { defaults: { staleTime: 1000 } },
    { mounts: [] },
    { mounts: { "/keys": {} } },
    { mounts: { keys: { focus: null } } },
    {
      mounts: Object.fromEntries(
        Array.from({ length: 65 }, (_, i) => [`keys-${i}`, {}])
      ),
    },
  ]) {
    expect(() => parseConsoleReadRefreshConfiguration(value)).toThrow(
      TypeError
    );
  }
});
