import { describe, expect, test } from "vitest";

import {
  consoleDevConfigFromEnv,
  defaultConsoleBundleRegistryUrl,
} from "./console-dev-config";

describe("console dev config", () => {
  test("is disabled by default and uses the production registry", () => {
    expect(consoleDevConfigFromEnv({})).toEqual({
      diagnosticsUrl: null,
      enabled: false,
      mode: "production",
      registryUrl: defaultConsoleBundleRegistryUrl,
      targetLabel: null,
    });
  });

  test("enables mock console package development", () => {
    expect(
      consoleDevConfigFromEnv({
        VITE_CONSOLE_DEV_DIAGNOSTICS_URL: "/console/dev/diagnostics.json",
        VITE_CONSOLE_DEV_MODE: "mock",
        VITE_CONSOLE_DEV_REGISTRY_URL: "/console/dev/registry.json",
        VITE_CONSOLE_DEV_TARGET_LABEL: "@lenso/auth-console",
      })
    ).toEqual({
      diagnosticsUrl: "/console/dev/diagnostics.json",
      enabled: true,
      mode: "mock",
      registryUrl: "/console/dev/registry.json",
      targetLabel: "@lenso/auth-console",
    });
  });

  test("enables real host console package development", () => {
    expect(
      consoleDevConfigFromEnv({
        VITE_CONSOLE_DEV_MODE: "host",
        VITE_CONSOLE_DEV_REGISTRY_URL: "/console/dev/registry.json",
      })
    ).toMatchObject({
      enabled: true,
      mode: "host",
      registryUrl: "/console/dev/registry.json",
    });
  });

  test("normalizes whitespace values and falls back from unknown modes", () => {
    expect(
      consoleDevConfigFromEnv({
        VITE_CONSOLE_DEV_DIAGNOSTICS_URL: "   ",
        VITE_CONSOLE_DEV_MODE: "preview",
        VITE_CONSOLE_DEV_REGISTRY_URL: "  ",
        VITE_CONSOLE_DEV_TARGET_LABEL: "  @lenso/auth-console  ",
      })
    ).toEqual({
      diagnosticsUrl: null,
      enabled: false,
      mode: "production",
      registryUrl: defaultConsoleBundleRegistryUrl,
      targetLabel: "@lenso/auth-console",
    });
  });
});
