import { CONSOLE_MODULE_API_PROTOCOL } from "@lenso/console-module-api";
import { describe, expect, test } from "vitest";

import { defineConsoleUiModule } from "./index";

const InvoicePage = () => null;

describe("console UI adapter", () => {
  test("binds declared surface components without knowing transport", () => {
    const module = defineConsoleUiModule({
      manifest: {
        consoleUi: "^1.0.0",
        hostApi: "^1.0.0",
        moduleId: "acme/billing",
        protocol: CONSOLE_MODULE_API_PROTOCOL,
        surfaces: [
          {
            area: "data",
            id: "invoices",
            label: "Invoices",
            path: "/invoices",
          },
        ],
      },
      surfaces: { invoices: InvoicePage },
    });

    expect(module.surfaces[0]?.component).toBe(InvoicePage);
  });

  test("requires a component for every declared surface", () => {
    expect(() =>
      defineConsoleUiModule({
        manifest: {
          consoleUi: "^1.0.0",
          hostApi: "^1.0.0",
          moduleId: "acme/billing",
          protocol: CONSOLE_MODULE_API_PROTOCOL,
          surfaces: [
            {
              area: "data",
              id: "invoices",
              label: "Invoices",
              path: "/invoices",
            },
          ],
        },
        surfaces: {},
      })
    ).toThrow("component is missing");
  });
});
