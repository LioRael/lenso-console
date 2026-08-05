import { describe, expect, test } from "vitest";

import {
  buildConsoleNavigation,
  buildConsoleRoutes,
  consoleModules,
  consoleNavigation,
  defineConsoleModule,
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

  test("keeps Module UI out of the prebuilt Shell bundle", () => {
    expect(consoleModules.map((module) => module.id)).toEqual([
      "lenso/console-workbench",
    ]);
    expect(
      selectDefaultConsoleRoute(buildConsoleRoutes(consoleModules)).path
    ).toBe("/");
  });

  test("places runtime-owned navigation after the host Runtime surface", () => {
    const systemWorkspace = buildWorkspaceNavigation(consoleNavigation).find(
      (workspace) => workspace.id === "system"
    );

    expect(systemWorkspace?.items.slice(0, 7).map((item) => item.path)).toEqual(
      [
        "/",
        "/system",
        "/modules",
        "/changes",
        "/runtime",
        "/delivery",
        "/settings",
      ]
    );
  });
});
