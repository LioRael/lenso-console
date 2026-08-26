import { describe, expect, test } from "vitest";

import {
  buildConsoleNavigation,
  buildConsoleRoutes,
  consoleModules,
  consoleModulesForDevMode,
  consoleNavigation,
  defineConsoleModule,
  findConsoleRoute,
  isConsoleOwnedLinkedRoute,
  selectDefaultConsoleRoute,
} from "./console-modules";
import { buildWorkspaceNavigation } from "./console-workspace-navigation";

function TestPage() {
  return <div>Test</div>;
}

describe("Console Module composition", () => {
  test("derives routes and navigation from composed Modules", () => {
    const module = defineConsoleModule({
      id: "lenso/test",
      surfaces: [
        {
          area: "runtime",
          component: TestPage,
          icon: "workflow",
          label: "Test",
          path: "/test",
        },
      ],
    });

    expect(buildConsoleRoutes([module])).toMatchObject([
      { moduleId: "lenso/test", path: "/test" },
    ]);
    expect(buildConsoleNavigation([module])).toMatchObject([
      { moduleId: "lenso/test", path: "/test" },
    ]);
  });

  test("rejects duplicate routes", () => {
    const first = defineConsoleModule({
      id: "lenso/first",
      surfaces: [
        { area: "runtime", component: TestPage, label: "First", path: "/same" },
      ],
    });
    const second = defineConsoleModule({
      id: "lenso/second",
      surfaces: [
        {
          area: "runtime",
          component: TestPage,
          label: "Second",
          path: "/same",
        },
      ],
    });

    expect(() => buildConsoleRoutes([first, second])).toThrow(
      "Duplicate console module route: /same"
    );
  });

  test("composes the primary Console navigation Modules", () => {
    expect(consoleModules.map((module) => module.id)).toEqual([
      "lenso/console-workbench",
      "lenso/system-registry",
      "lenso/platform-story",
    ]);
    expect(
      selectDefaultConsoleRoute(buildConsoleRoutes(consoleModules)).path
    ).toBe("/");
  });

  test("keeps the same primary composition in the seeded mock preview", () => {
    expect(consoleModulesForDevMode("mock").map((module) => module.id)).toEqual(
      [
        "lenso/console-workbench",
        "lenso/system-registry",
        "lenso/platform-story",
      ]
    );
    const systemWorkspace = buildWorkspaceNavigation(
      buildConsoleNavigation(consoleModulesForDevMode("mock"))
    ).find((workspace) => workspace.id === "system");

    expect(systemWorkspace?.items.map((item) => item.path)).toEqual([
      "/",
      "/plugins",
      "/modules",
      "/services",
      "/stories",
      "/settings",
    ]);
  });

  test("resolves a linked Module Surface by path for the mock route", () => {
    const routes = buildConsoleRoutes(consoleModulesForDevMode("mock"));

    expect(findConsoleRoute("/services", routes)).toMatchObject({
      moduleId: "lenso/system-registry",
      path: "/services",
    });
  });

  test("identifies Console-owned linked routes without treating dynamic Modules as local", () => {
    const routes = buildConsoleRoutes(consoleModulesForDevMode("production"));

    expect(
      isConsoleOwnedLinkedRoute(findConsoleRoute("/services", routes))
    ).toBe(true);
    expect(
      isConsoleOwnedLinkedRoute(findConsoleRoute("/stories", routes))
    ).toBe(true);
    expect(
      isConsoleOwnedLinkedRoute({
        area: "configuration",
        component: TestPage,
        label: "Users",
        moduleId: "lenso/auth",
        path: "/auth/users",
      })
    ).toBe(false);
  });

  test("keeps the exported Shell navigation to the primary surfaces", () => {
    const systemWorkspace = buildWorkspaceNavigation(consoleNavigation).find(
      (workspace) => workspace.id === "system"
    );

    expect(systemWorkspace?.items.map((item) => item.path)).toEqual([
      "/",
      "/plugins",
      "/modules",
      "/settings",
    ]);
  });
});
