import { describe, expect, test } from "vitest";

import { SystemRegistryConsolePage, systemRegistryConsoleModule } from ".";

describe("system registry Console Module", () => {
  test("declares the managed Services surface owned by the registry module", () => {
    expect(systemRegistryConsoleModule).toMatchObject({
      id: "lenso/system-registry",
      surfaces: [{ path: "/system/services" }],
    });
    expect(SystemRegistryConsolePage).toBeTypeOf("function");
  });
});
