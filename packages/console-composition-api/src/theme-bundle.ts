/* eslint-disable complexity, func-style, no-use-before-define */

import type { ConsoleUiComposition } from "./index.js";

export const CONSOLE_THEME_BUNDLE_FORMAT = "console_theme_bundle" as const;

export type ConsoleThemeVariantMode = "dark" | "light" | "custom";

export interface ConsoleThemeVariantManifest {
  readonly id: string;
  readonly label: string;
  readonly mode: ConsoleThemeVariantMode;
  /** Optional semantic values supplied by the bundle's generated CSS/theme. */
  readonly tokenOverrides?: Readonly<Record<string, string | number>>;
}

export type ConsoleThemeBundleAssetKind = "style" | "font" | "icon" | "image";

export interface ConsoleThemeBundleAsset {
  readonly name: string;
  readonly path: string;
  readonly kind: ConsoleThemeBundleAssetKind;
  readonly order?: number;
  readonly media?: string;
  /** Omit to make the asset available to every Theme Variant. */
  readonly variantId?: string;
}

export interface ConsoleThemeBundleManifest {
  readonly format: typeof CONSOLE_THEME_BUNDLE_FORMAT;
  readonly bundleId: string;
  readonly displayName: string;
  readonly version: string;
  readonly consoleUi: string;
  readonly defaultVariant: string;
  readonly variants: readonly ConsoleThemeVariantManifest[];
  readonly tokenOverrides: Readonly<Record<string, string | number>>;
  readonly assets: readonly ConsoleThemeBundleAsset[];
  readonly composition?: {
    readonly entry: string;
    readonly exportName?: string;
  };
}

export interface ConsoleThemeBundleReceipt {
  readonly format: typeof CONSOLE_THEME_BUNDLE_FORMAT;
  readonly bundleId: string;
  readonly version: string;
  readonly artifactDigest: `sha256:${string}`;
  readonly basePath: string;
  readonly manifest: ConsoleThemeBundleManifest;
  readonly entries: readonly { name: string; path: string }[];
}

export function defineConsoleThemeBundleManifest(
  manifest: ConsoleThemeBundleManifest
): ConsoleThemeBundleManifest {
  if (
    !manifest ||
    manifest.format !== CONSOLE_THEME_BUNDLE_FORMAT ||
    !publisherNamespacedId(manifest.bundleId) ||
    !manifest.displayName.trim() ||
    !manifest.version.trim() ||
    !manifest.consoleUi.trim() ||
    !manifest.variants.length ||
    !manifest.tokenOverrides ||
    !Array.isArray(manifest.assets)
  ) {
    throw new TypeError("Console Theme Bundle manifest is invalid");
  }

  const variantIds = new Set<string>();
  for (const variant of manifest.variants) {
    if (
      !variant.id.trim() ||
      !variant.label.trim() ||
      !["dark", "light", "custom"].includes(variant.mode) ||
      !variantIds.add(variant.id)
    ) {
      throw new TypeError("Console Theme Bundle variants must be unique");
    }
    if (variant.tokenOverrides) {
      for (const [token, value] of Object.entries(variant.tokenOverrides)) {
        if (
          !token.trim() ||
          (typeof value !== "string" && typeof value !== "number")
        ) {
          throw new TypeError(
            "Console Theme Bundle token overrides are invalid"
          );
        }
      }
    }
  }
  if (!variantIds.has(manifest.defaultVariant)) {
    throw new TypeError("Console Theme Bundle default variant is not declared");
  }

  const paths = new Set<string>();
  for (const asset of manifest.assets) {
    if (
      !asset.name.trim() ||
      !safeRelativePath(asset.path) ||
      !["style", "font", "icon", "image"].includes(asset.kind) ||
      !paths.add(asset.path) ||
      (asset.variantId !== undefined && !variantIds.has(asset.variantId))
    ) {
      throw new TypeError(
        "Console Theme Bundle assets must be safe and unique"
      );
    }
  }
  if (manifest.composition && !safeRelativePath(manifest.composition.entry)) {
    throw new TypeError(
      "Console Theme Bundle composition entry must be relative"
    );
  }
  return manifest;
}

export function defineConsoleThemeBundle(
  manifest: ConsoleThemeBundleManifest,
  composition?: ConsoleUiComposition
) {
  defineConsoleThemeBundleManifest(manifest);
  if (manifest.composition && !composition) {
    throw new TypeError("Console Theme Bundle composition export is missing");
  }
  return { composition, manifest } as const;
}

function publisherNamespacedId(value: string): boolean {
  return /^[^/\s]+\/[^/\s]+$/u.test(value);
}

function safeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value
      .split("/")
      .every(
        (segment) => segment.length > 0 && segment !== "." && segment !== ".."
      )
  );
}
