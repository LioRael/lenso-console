import { describe, expect, test } from "vitest";

import { AuthProvidersPage, authConsoleManifest, authConsoleModule } from ".";

describe("auth console package", () => {
  test("declares a multi-surface Auth workspace", () => {
    expect(authConsoleManifest).toMatchObject({
      exportName: "authConsoleModule",
      id: "auth",
      packageName: "@lenso/auth-console",
      source: "installed",
      surfaces: expect.arrayContaining([
        expect.objectContaining({
          label: "Users",
          navigation: expect.objectContaining({
            group: expect.objectContaining({ id: "directory" }),
            workspace: expect.objectContaining({ id: "auth" }),
          }),
          route: "/auth/users",
          surfaceName: "users",
        }),
        expect.objectContaining({
          label: "Providers",
          navigation: expect.objectContaining({
            group: expect.objectContaining({ id: "sign-in" }),
            workspace: expect.objectContaining({ id: "auth" }),
          }),
          route: "/auth/providers",
          surfaceName: "providers",
        }),
      ]),
      version: "workspace",
    });
    expect(authConsoleModule).toMatchObject({
      id: "auth",
      surfaces: expect.arrayContaining([
        expect.objectContaining({ path: "/auth/providers" }),
        expect.objectContaining({ path: "/auth/providers/github" }),
        expect.objectContaining({ path: "/auth/users" }),
      ]),
    });
    expect(AuthProvidersPage).toBeTypeOf("function");
  });
});
