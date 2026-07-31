import { describe, expect, test } from "vitest";

import {
  SystemRegistryConsolePage,
  systemRegistryConsoleManifest,
  systemRegistryConsoleModule,
} from ".";

describe("system registry console package", () => {
  test("declares the managed Services surface owned by the registry module", () => {
    expect(systemRegistryConsoleManifest).toMatchObject({
      id: "lenso/system-registry",
      packageName: "@lenso/system-registry-console",
      requiredCapabilities: ["console.system-registry.read"],
      route: "/system/services",
      surfaceName: "managed-services",
    });
    expect(systemRegistryConsoleModule).toMatchObject({
      id: "lenso/system-registry",
      surfaces: [{ path: "/system/services" }],
    });
    expect(SystemRegistryConsolePage).toBeTypeOf("function");
  });
});
