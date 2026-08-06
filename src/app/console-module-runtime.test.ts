import {
  CONSOLE_MODULE_API_PROTOCOL,
  type ConsoleSha256Digest,
} from "@lenso/console-module-api";
import { defineConsoleUiModule } from "@lenso/console-ui";
import { describe, expect, test, vi } from "vitest";

import {
  loadConsoleUiModule,
  type ConsoleUiArtifactReceipt,
} from "./console-module-runtime";

const manifest = {
  consoleUi: "^1.0.0",
  hostApi: "^1.0.0",
  moduleId: "acme/billing",
  protocol: CONSOLE_MODULE_API_PROTOCOL,
  surfaces: [
    {
      area: "data" as const,
      id: "invoices",
      label: "Invoices",
      path: "/invoices",
    },
  ],
};

const receipt = {
  artifactDigest: `sha256:${"a".repeat(64)}` as ConsoleSha256Digest,
  basePath: "/artifacts/billing/",
  entry: "entry.js",
  entries: [{ name: "module", path: "entry.js" }],
  format: "console_ui_esm" as const,
  manifest,
  moduleId: "acme/billing",
  moduleReleaseDigest: `sha256:${"b".repeat(64)}` as ConsoleSha256Digest,
} satisfies ConsoleUiArtifactReceipt;

describe("Console Module runtime loader", () => {
  test("loads a same-origin module entry after receipt validation", async () => {
    const module = defineConsoleUiModule({
      manifest,
      surfaces: { invoices: () => null },
    });
    const importer = vi.fn().mockResolvedValue({ default: module });

    await expect(
      loadConsoleUiModule(receipt, {
        importModule: importer,
        origin: "https://console.example",
      })
    ).resolves.toMatchObject({ manifest: { moduleId: "acme/billing" } });
    expect(importer).toHaveBeenCalledWith("/artifacts/billing/entry.js");
  });

  test("rejects a module whose export identity differs from the receipt", async () => {
    const importer = vi.fn().mockResolvedValue({
      default: defineConsoleUiModule({
        manifest: { ...manifest, moduleId: "acme/other" },
        surfaces: { invoices: () => null },
      }),
    });

    await expect(
      loadConsoleUiModule(receipt, {
        importModule: importer,
        origin: "https://console.example",
      })
    ).rejects.toMatchObject({ code: "incompatible" });
  });

  test("rejects a module whose declared surface contract differs from the receipt", async () => {
    const importer = vi.fn().mockResolvedValue({
      default: defineConsoleUiModule({
        manifest: {
          ...manifest,
          surfaces: [
            { area: "data", id: "invoices", label: "Invoices", path: "/other" },
          ],
        },
        surfaces: { invoices: () => null },
      }),
    });

    await expect(
      loadConsoleUiModule(receipt, {
        importModule: importer,
        origin: "https://console.example",
      })
    ).rejects.toMatchObject({ code: "incompatible" });
  });

  test("accepts equivalent manifests with different nested property order", async () => {
    const receiptManifest = {
      ...manifest,
      surfaces: [
        {
          area: "data" as const,
          id: "invoices",
          label: "Invoices",
          localizedLabels: { "zh-CN": "发票", en: "Invoices" },
          path: "/invoices",
        },
      ],
    };
    const importedManifest = {
      ...manifest,
      surfaces: [
        {
          area: "data" as const,
          id: "invoices",
          label: "Invoices",
          localizedLabels: { en: "Invoices", "zh-CN": "发票" },
          path: "/invoices",
        },
      ],
    };
    const importer = vi.fn().mockResolvedValue({
      default: defineConsoleUiModule({
        manifest: importedManifest,
        surfaces: { invoices: () => null },
      }),
    });

    await expect(
      loadConsoleUiModule(
        { ...receipt, manifest: receiptManifest },
        { importModule: importer, origin: "https://console.example" }
      )
    ).resolves.toMatchObject({ manifest: { moduleId: "acme/billing" } });
  });

  test("rejects an unsafe entry before importing it", async () => {
    const importer = vi.fn();

    await expect(
      loadConsoleUiModule(
        { ...receipt, entry: "../entry.js" },
        { importModule: importer, origin: "https://console.example" }
      )
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(importer).not.toHaveBeenCalled();
  });

  test("rejects a style asset that is not declared in the receipt", async () => {
    const importer = vi.fn();

    await expect(
      loadConsoleUiModule(
        {
          ...receipt,
          styleAssets: [{ path: "theme.css" }],
        },
        { importModule: importer, origin: "https://console.example" }
      )
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(importer).not.toHaveBeenCalled();
  });
});
