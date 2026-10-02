import { describe, expect, test } from "vitest";

import { consoleDevServerConfigFromEnv } from "./console-dev-server-config";

describe("Console development server config", () => {
  test("binds loopback when remote development is not enabled", () => {
    expect(consoleDevServerConfigFromEnv({})).toEqual({
      allowedHosts: [],
      host: "127.0.0.1",
      trustedOrigin: undefined,
    });
  });

  test("uses one trusted Origin as the explicit remote-development opt-in", () => {
    expect(
      consoleDevServerConfigFromEnv({
        LENSO_CONSOLE_DEV_REMOTE_ORIGIN: " https://console-dev.example:7443/ ",
      })
    ).toEqual({
      allowedHosts: ["console-dev.example"],
      host: "0.0.0.0",
      trustedOrigin: "https://console-dev.example:7443",
    });
  });

  test.each([
    "file:///tmp/console",
    "https://user@example.test",
    "https://example.test/path",
    "https://example.test?mode=dev",
  ])("rejects an invalid remote-development Origin: %s", (origin) => {
    expect(() =>
      consoleDevServerConfigFromEnv({
        LENSO_CONSOLE_DEV_REMOTE_ORIGIN: origin,
      })
    ).toThrow("LENSO_CONSOLE_DEV_REMOTE_ORIGIN must be an HTTP(S) Origin");
  });
});
