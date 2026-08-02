import { describe, expect, test } from "vitest";

import {
  buildConsoleNavigation,
  buildConsoleRoutes,
  consoleModules,
  defineConsoleModule,
  selectDefaultConsoleRoute,
} from "./console-modules";

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

  test("composes linked Console-owned Modules without package exports", () => {
    expect(consoleModules.map((module) => module.id)).toEqual(
      expect.arrayContaining([
        "lenso/console-workbench",
        "lenso/platform-story",
        "lenso/system-registry",
      ])
    );
    expect(
      selectDefaultConsoleRoute(buildConsoleRoutes(consoleModules)).path
    ).toBe("/");
  });
});
