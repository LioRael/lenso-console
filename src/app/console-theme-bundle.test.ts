import { CONSOLE_THEME_BUNDLE_FORMAT } from "@lenso/console-composition-api";
import { describe, expect, test, vi } from "vitest";

import { loadConsoleThemeBundle } from "./console-theme-bundle";

const receipt = {
  artifactDigest: `sha256:${"a".repeat(64)}` as const,
  basePath: "/artifacts/theme/",
  bundleId: "acme/industrial-console",
  entries: [
    { name: "composition", path: "index.js" },
    { name: "style", path: "theme.css" },
  ],
  format: CONSOLE_THEME_BUNDLE_FORMAT,
  manifest: {
    assets: [{ kind: "style" as const, name: "style", path: "theme.css" }],
    bundleId: "acme/industrial-console",
    composition: { entry: "index.js" },
    consoleUi: "^1.0.0",
    defaultVariant: "dark",
    displayName: "Industrial Console",
    format: CONSOLE_THEME_BUNDLE_FORMAT,
    tokenOverrides: {},
    variants: [{ id: "dark", label: "Dark", mode: "dark" as const }],
    version: "1.0.0",
  },
  version: "1.0.0",
} as const;

describe("Console Theme Bundle loader", () => {
  test("loads the composition after validating the manifest", async () => {
    const importer = vi.fn().mockResolvedValue({
      default: {
        consoleUi: "^1.0.0",
        protocol: "lenso.console-ui-composition.v1",
      },
    });

    await expect(
      loadConsoleThemeBundle(receipt, {
        importModule: importer,
        origin: "https://console.example",
      })
    ).resolves.toMatchObject({
      manifest: { bundleId: "acme/industrial-console" },
      composition: { consoleUi: "^1.0.0" },
    });
    expect(importer).toHaveBeenCalledWith("/artifacts/theme/index.js");
  });

  test("rejects an undeclared asset before importing composition", async () => {
    const importer = vi.fn();
    await expect(
      loadConsoleThemeBundle(
        {
          ...receipt,
          manifest: {
            ...receipt.manifest,
            assets: [
              ...receipt.manifest.assets,
              { kind: "style" as const, name: "missing", path: "missing.css" },
            ],
          },
        },
        { importModule: importer, origin: "https://console.example" }
      )
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(importer).not.toHaveBeenCalled();
  });
});
