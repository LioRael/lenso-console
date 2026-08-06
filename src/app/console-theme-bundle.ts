import {
  defineConsoleThemeBundle,
  defineConsoleThemeBundleManifest,
  type ConsoleThemeBundleReceipt,
  type ConsoleUiComposition,
} from "@lenso/console-composition-api";
import {
  ConsoleHostError,
  isConsoleSha256Digest,
} from "@lenso/console-module-api";

export interface ConsoleThemeBundleRuntimeOptions {
  importModule?: (url: string) => Promise<Record<string, unknown>>;
  origin?: string;
  variantId?: string;
}

export async function loadConsoleThemeBundle(
  receipt: ConsoleThemeBundleReceipt,
  options: ConsoleThemeBundleRuntimeOptions = {}
): Promise<{
  manifest: ConsoleThemeBundleReceipt["manifest"];
  composition?: ConsoleUiComposition;
}> {
  validateReceipt(receipt, options.origin);
  await loadStyleAssets(receipt, options.origin, options.variantId);

  if (!receipt.manifest.composition) {
    return { manifest: receipt.manifest };
  }
  const entryUrl = artifactUrl(
    receipt,
    receipt.manifest.composition.entry,
    options.origin
  );
  const importModule = options.importModule ?? dynamicImport;
  let namespace: Record<string, unknown>;
  try {
    namespace = await importModule(entryUrl);
  } catch {
    throw new ConsoleHostError(
      "unavailable",
      `Console Theme Bundle Composition import failed: ${receipt.bundleId}`,
      { retryable: true, status: 503 }
    );
  }
  const exportName = receipt.manifest.composition.exportName ?? "default";
  const composition = namespace[exportName];
  if (!composition || typeof composition !== "object") {
    throw new ConsoleHostError(
      "incompatible",
      `Console Theme Bundle Composition export is invalid: ${receipt.bundleId}`
    );
  }
  try {
    const bundle = defineConsoleThemeBundle(
      receipt.manifest,
      composition as ConsoleUiComposition
    );
    return bundle.composition
      ? { composition: bundle.composition, manifest: bundle.manifest }
      : { manifest: bundle.manifest };
  } catch {
    throw new ConsoleHostError(
      "incompatible",
      `Console Theme Bundle Composition contract is invalid: ${receipt.bundleId}`
    );
  }
}

function validateReceipt(
  receipt: ConsoleThemeBundleReceipt,
  origin?: string
): void {
  if (
    !receipt ||
    receipt.format !== "console_theme_bundle" ||
    typeof receipt.bundleId !== "string" ||
    !receipt.bundleId.trim() ||
    typeof receipt.version !== "string" ||
    !isConsoleSha256Digest(receipt.artifactDigest) ||
    typeof receipt.basePath !== "string" ||
    !Array.isArray(receipt.entries) ||
    receipt.entries.length === 0
  ) {
    throw new ConsoleHostError(
      "invalid_request",
      "Console Theme Bundle receipt is invalid"
    );
  }
  try {
    defineConsoleThemeBundleManifest(receipt.manifest);
  } catch {
    throw new ConsoleHostError(
      "invalid_request",
      `Console Theme Bundle manifest is invalid: ${receipt.bundleId}`
    );
  }
  if (
    receipt.manifest.bundleId !== receipt.bundleId ||
    !receipt.entries.every(
      (entry) =>
        typeof entry.name === "string" &&
        entry.name.trim() &&
        safeRelativePath(entry.path)
    )
  ) {
    throw new ConsoleHostError(
      "incompatible",
      `Console Theme Bundle receipt identity is invalid: ${receipt.bundleId}`
    );
  }
  for (const asset of receipt.manifest.assets) {
    if (!receipt.entries.some((entry) => entry.path === asset.path)) {
      throw new ConsoleHostError(
        "invalid_request",
        `Console Theme Bundle asset is not declared: ${asset.path}`
      );
    }
  }
  artifactUrl(
    receipt,
    receipt.manifest.composition?.entry ?? receipt.entries[0]!.path,
    origin
  );
}

async function loadStyleAssets(
  receipt: ConsoleThemeBundleReceipt,
  origin?: string,
  variantId?: string
): Promise<void> {
  if (typeof document === "undefined" || !document.head) {
    return;
  }
  const assets = receipt.manifest.assets
    .filter(
      (asset) =>
        asset.kind === "style" &&
        (asset.variantId === undefined || asset.variantId === variantId)
    )
    .toSorted((left, right) => (left.order ?? 0) - (right.order ?? 0));
  for (const asset of assets) {
    const href = artifactUrl(receipt, asset.path, origin);
    const existing = Array.from(
      document.head.querySelectorAll("link[data-lenso-console-theme-style]")
    ).some(
      (link) =>
        (link as HTMLLinkElement).dataset.lensoConsoleThemeStyle === href
    );
    if (existing) {
      continue;
    }
    await new Promise<void>((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      if (asset.media) {
        link.media = asset.media;
      }
      link.dataset.lensoConsoleThemeStyle = href;
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener(
        "error",
        () =>
          reject(
            new ConsoleHostError(
              "unavailable",
              `Console Theme Bundle style asset failed to load: ${asset.path}`,
              { retryable: true, status: 503 }
            )
          ),
        { once: true }
      );
      document.head.append(link);
    });
  }
}

function artifactUrl(
  receipt: ConsoleThemeBundleReceipt,
  path: string,
  origin = globalThis.location?.origin
): string {
  if (!safeRelativePath(path)) {
    throw new ConsoleHostError(
      "invalid_request",
      "Console Theme Bundle asset path must be relative"
    );
  }
  if (!receipt.entries.some((entry) => entry.path === path)) {
    throw new ConsoleHostError(
      "invalid_request",
      `Console Theme Bundle path is not declared: ${path}`
    );
  }
  const expectedOrigin =
    origin ?? globalThis.location?.origin ?? "http://lenso.local";
  try {
    const base = new URL(receipt.basePath, expectedOrigin);
    const asset = new URL(path, base);
    if (asset.origin !== expectedOrigin) {
      throw new Error("cross-origin");
    }
    return `${asset.pathname}${asset.search}${asset.hash}`;
  } catch {
    throw new ConsoleHostError(
      "forbidden",
      "Console Theme Bundle must be same-origin"
    );
  }
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

async function dynamicImport(url: string): Promise<Record<string, unknown>> {
  /* @vite-ignore */
  return import(url) as Promise<Record<string, unknown>>;
}
