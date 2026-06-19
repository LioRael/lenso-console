import { describe, expect, test } from "vitest";

import { AuthConsolePage, authConsoleManifest, authConsoleModule } from ".";

describe("auth console package", () => {
  test("declares an installable auth console package export", () => {
    expect(authConsoleManifest).toMatchObject({
      exportName: "authConsoleModule",
      navigation: {
        order: 50,
        workspace: {
          icon: "shield",
          id: "auth",
          label: "Auth",
        },
      },
      packageName: "@lenso/auth-console",
      requiredCapabilities: ["auth.users.read"],
      route: "/data/auth",
      source: "installed",
      surfaceName: "auth",
      version: "workspace",
    });
    expect(authConsoleModule).toMatchObject({
      id: "auth",
      surfaces: [
        {
          label: "Auth",
          navigation: authConsoleManifest.navigation,
          path: "/data/auth",
        },
      ],
    });
    expect(AuthConsolePage).toBeTypeOf("function");
  });
});
