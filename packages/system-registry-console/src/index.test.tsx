import { describe, expect, test } from "vitest";

import { SystemRegistryConsolePage, systemRegistryConsoleModule } from ".";

describe("system registry Console Module", () => {
  test("declares the Services surface owned by the registry module", () => {
    expect(systemRegistryConsoleModule).toMatchObject({
      id: "lenso/system-registry",
      surfaces: [{ icon: "blocks", label: "Services", path: "/services" }],
    });
    expect(SystemRegistryConsolePage).toBeTypeOf("function");
  });
});
