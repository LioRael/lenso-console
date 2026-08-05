import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  Button,
  DataRow,
  Tabs,
  consoleLocalizedLabel,
  defineConsoleModule,
  isConsoleModule,
} from ".";

describe("private Console UI primitives", () => {
  test("ships the Shell theme and controls", () => {
    const theme = readFileSync(
      new URL("../../console-ui/theme.css", import.meta.url),
      "utf-8"
    );
    const tokens = readFileSync(
      new URL("../../console-ui/tokens.css", import.meta.url),
      "utf-8"
    );
    const components = readFileSync(
      new URL("../../console-ui/components.css", import.meta.url),
      "utf-8"
    );

    expect(theme).toContain('@import "./tokens.css";');
    expect(theme).toContain('@import "./components.css";');
    expect(tokens).toContain(':root[data-theme="light"]');
    expect(components).toContain(".lenso-ui-button");
    expect(Button).toBeTypeOf("function");
    expect(Tabs.Tab).toBeTypeOf("function");
    expect(DataRow({ primary: "Auth" }).props.role).toBe("row");
  });

  test("validates linked Console Modules", () => {
    const module = {
      id: "lenso/billing",
      surfaces: [
        {
          area: "data",
          component: () => null,
          label: "Billing",
          path: "/billing",
        },
      ],
    } as const;

    expect(isConsoleModule(module)).toBe(true);
    expect(defineConsoleModule(module)).toBe(module);
    expect(isConsoleModule({ id: "empty", surfaces: [] })).toBe(false);
  });

  test("resolves localized labels", () => {
    const item = {
      label: "Contacts",
      localizedLabels: { "zh-CN": "联系人" },
    } as const;

    expect(consoleLocalizedLabel(item, "zh-CN")).toBe("联系人");
    expect(consoleLocalizedLabel(item, "en")).toBe("Contacts");
  });
});
