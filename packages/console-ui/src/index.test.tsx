import { CONSOLE_MODULE_API_PROTOCOL } from "@lenso/console-module-api";
import type { ConsoleClient } from "@lenso/console-module-api";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { defineConsoleUiModule } from "./index";

const InvoicePage = () => null;

const clientFor = (moduleId: string): ConsoleClient => {
  const digest =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

  return {
    capabilities: { has: () => true, list: () => ["console.test"] },
    identity: {
      moduleId,
      moduleReleaseDigest: digest,
      uiArtifactDigest: digest,
    },
    inventory: () => Promise.reject(new Error("unused")),
    managedServiceContext: {
      callerModuleId: moduleId,
      capabilities: ["console.test"],
      delegatedActorSubject: "usr_test",
      delegatedAuthorityDigest: digest,
      environmentId: "test",
      serviceId: "test",
      systemId: "test",
      targetServicePrincipal: "svc.test",
    },
    navigate: () => {
      throw new Error("unused");
    },
    readConfig: () => Promise.reject(new Error("unused")),
    resolveActionContributions: () => Promise.reject(new Error("unused")),
    surfaceApi: {
      invoke: () => Promise.reject(new Error("unused")),
    },
    writeConfig: () => Promise.reject(new Error("unused")),
  };
};

describe("console UI adapter", () => {
  test("binds declared surface components without knowing transport", () => {
    const module = defineConsoleUiModule({
      manifest: {
        consoleUi: "^1.0.0",
        hostApi: "^2.0.0",
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
          hostApi: "^2.0.0",
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

  test("shares the client context across independently loaded UI bundles", async () => {
    vi.resetModules();
    const hostUi = await import("./index");
    vi.resetModules();
    const moduleUi = await import("./index");

    expect(hostUi.ConsoleModuleProvider).not.toBe(
      moduleUi.ConsoleModuleProvider
    );

    const ClientIdentity = () => (
      <span>{moduleUi.useConsoleClient().identity.moduleId}</span>
    );
    const renderClient = (moduleId: string) =>
      renderToStaticMarkup(
        <hostUi.ConsoleModuleProvider client={clientFor(moduleId)}>
          <ClientIdentity />
        </hostUi.ConsoleModuleProvider>
      );

    expect(renderClient("support/tickets")).toContain("support/tickets");
    expect(renderClient("acme/billing")).toContain("acme/billing");
  });
});
