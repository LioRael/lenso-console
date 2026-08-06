import { describe, expect, test } from "vitest";

import {
  CONSOLE_THEME_BUNDLE_FORMAT,
  defineConsoleThemeBundleManifest,
} from "./theme-bundle";

const manifest = {
  assets: [
    { kind: "style" as const, name: "theme", path: "assets/theme.css" },
    { kind: "style" as const, name: "composition", path: "index.js" },
  ],
  bundleId: "acme/industrial-console",
  composition: { entry: "index.js" },
  consoleUi: "^1.0.0",
  defaultVariant: "dark",
  displayName: "Industrial Console",
  format: CONSOLE_THEME_BUNDLE_FORMAT,
  tokenOverrides: {},
  variants: [
    { id: "dark", label: "Dark", mode: "dark" as const },
    { id: "light", label: "Light", mode: "light" as const },
  ],
  version: "1.0.0",
};

describe("Theme Bundle manifest", () => {
  test("accepts a namespaced bundle with declared variants and assets", () => {
    expect(defineConsoleThemeBundleManifest(manifest)).toEqual(manifest);
  });

  test("rejects an unsafe composition entry", () => {
    expect(() =>
      defineConsoleThemeBundleManifest({
        ...manifest,
        composition: { entry: "../missing.js" },
      })
    ).toThrow("composition entry must be relative");
  });

  test("rejects an unnamespaced bundle id", () => {
    expect(() =>
      defineConsoleThemeBundleManifest({ ...manifest, bundleId: "default" })
    ).toThrow("manifest is invalid");
  });
});
