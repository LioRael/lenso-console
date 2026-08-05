import { describe, expect, test } from "vitest";

import { consoleDevConfigFromEnv } from "./console-dev-config";

describe("console dev config", () => {
  test("is disabled by default", () => {
    expect(consoleDevConfigFromEnv({})).toEqual({
      diagnosticsUrl: null,
      enabled: false,
      mode: "production",
      targetLabel: null,
    });
  });

  test("enables mock ESM Module UI development", () => {
    expect(
      consoleDevConfigFromEnv({
        VITE_CONSOLE_DEV_DIAGNOSTICS_URL: "/console/dev/diagnostics.json",
        VITE_CONSOLE_DEV_MODE: "mock",
        VITE_CONSOLE_DEV_TARGET_LABEL: "@lenso/auth-console",
      })
    ).toEqual({
      diagnosticsUrl: "/console/dev/diagnostics.json",
      enabled: true,
      mode: "mock",
      targetLabel: "@lenso/auth-console",
    });
  });

  test("enables real host ESM Module UI development", () => {
    expect(
      consoleDevConfigFromEnv({
        VITE_CONSOLE_DEV_MODE: "host",
      })
    ).toMatchObject({
      enabled: true,
      mode: "host",
    });
  });

  test("normalizes whitespace values and falls back from unknown modes", () => {
    expect(
      consoleDevConfigFromEnv({
        VITE_CONSOLE_DEV_DIAGNOSTICS_URL: "   ",
        VITE_CONSOLE_DEV_MODE: "preview",
        VITE_CONSOLE_DEV_TARGET_LABEL: "  @lenso/auth-console  ",
      })
    ).toEqual({
      diagnosticsUrl: null,
      enabled: false,
      mode: "production",
      targetLabel: "@lenso/auth-console",
    });
  });
});
