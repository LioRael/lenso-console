import { describe, expect, test } from "vitest";

import {
  consoleModuleMetadataWithFallback,
  navigationFromConsoleModuleMetadata,
} from "./console-module-metadata";

describe("Console Module metadata", () => {
  test("keeps missing backend evidence explicit", () => {
    expect(
      consoleModuleMetadataWithFallback({ apiMode: true, data: undefined })
    ).toEqual([]);
  });

  test("adds isolated Module UI navigation without package installation", () => {
    const navigation = navigationFromConsoleModuleMetadata(
      [
        {
          module_name: "lenso/auth",
          console: [
            {
              area: "operations",
              label: "Operators",
              name: "operators",
              presentation: {
                bridge_protocol: "lenso.console-bridge.v1",
                entry: "auth-users",
                kind: "isolated",
              },
              route: "/auth/operators",
            },
          ],
        },
      ],
      []
    );

    expect(navigation).toContainEqual(
      expect.objectContaining({
        moduleId: "lenso/auth",
        path: "/auth/operators",
      })
    );
  });
});
