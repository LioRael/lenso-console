import {
  ConsoleHostError,
  isConsoleSha256Digest,
  type ConsoleSha256Digest,
  type ConsoleModuleManifest,
  validateConsoleManifest,
} from "@lenso/console-module-api";
import { type ConsoleUiModule, defineConsoleUiModule } from "@lenso/console-ui";

export interface ConsoleUiArtifactReceipt {
  format: "console_ui_esm";
  moduleId: string;
  moduleReleaseDigest: ConsoleSha256Digest;
  artifactDigest: ConsoleSha256Digest;
  basePath: string;
  entry: string;
  entries: readonly { name: string; path: string }[];
  styleAssets?: readonly ConsoleUiStyleAsset[];
  manifest: ConsoleModuleManifest;
}

export interface ConsoleUiStyleAsset {
  path: string;
  order?: number;
  media?: string;
}

export interface ConsoleModuleRuntimeOptions {
  importModule?: (url: string) => Promise<Record<string, unknown>>;
  origin?: string;
}

export async function loadConsoleUiModule(
  receipt: ConsoleUiArtifactReceipt,
  options: ConsoleModuleRuntimeOptions = {}
): Promise<ConsoleUiModule> {
  validateReceipt(receipt, options.origin);
  await loadStyleAssets(receipt, options.origin);
  const entryUrl = artifactEntryUrl(receipt, options.origin);
  const importModule = options.importModule ?? dynamicImport;
  let namespace: Record<string, unknown>;
  try {
    namespace = await importModule(entryUrl);
  } catch {
    throw new ConsoleHostError(
      "unavailable",
      `Console Module UI import failed: ${receipt.moduleId}`,
      { retryable: true, status: 503 }
    );
  }

  const exported = namespace.default;
  if (!isConsoleUiModuleShape(exported)) {
    throw new ConsoleHostError(
      "incompatible",
      `Console Module UI export is invalid: ${receipt.moduleId}`
    );
  }
  if (exported.manifest.moduleId !== receipt.moduleId) {
    throw new ConsoleHostError(
      "incompatible",
      `Console Module UI identity does not match receipt: ${receipt.moduleId}`
    );
  }
  if (
    exported.manifest.hostApi !== receipt.manifest.hostApi ||
    exported.manifest.consoleUi !== receipt.manifest.consoleUi
  ) {
    throw new ConsoleHostError(
      "incompatible",
      `Console Module UI version does not match receipt: ${receipt.moduleId}`
    );
  }

  if (!manifestsMatch(exported.manifest, receipt.manifest)) {
    throw new ConsoleHostError(
      "incompatible",
      `Console Module UI surface contract does not match receipt: ${receipt.moduleId}`
    );
  }

  try {
    return defineConsoleUiModule({
      manifest: exported.manifest,
      surfaces: Object.fromEntries(
        exported.surfaces.map((surface) => [surface.id, surface.component])
      ),
    });
  } catch {
    throw new ConsoleHostError(
      "incompatible",
      `Console Module UI manifest is invalid: ${receipt.moduleId}`
    );
  }
}

function validateReceipt(
  receipt: ConsoleUiArtifactReceipt,
  origin = globalThis.location?.origin
): void {
  if (
    !receipt ||
    typeof receipt !== "object" ||
    receipt.format !== "console_ui_esm" ||
    typeof receipt.moduleId !== "string" ||
    typeof receipt.basePath !== "string" ||
    typeof receipt.entry !== "string" ||
    !receipt.moduleId ||
    !isConsoleSha256Digest(receipt.moduleReleaseDigest) ||
    !isConsoleSha256Digest(receipt.artifactDigest) ||
    !receipt.basePath ||
    !receipt.entry ||
    !Array.isArray(receipt.entries) ||
    receipt.entries.length === 0 ||
    (receipt.styleAssets !== undefined &&
      (!Array.isArray(receipt.styleAssets) ||
        receipt.styleAssets.some(
          (asset) =>
            !asset ||
            typeof asset !== "object" ||
            typeof asset.path !== "string" ||
            !asset.path.trim() ||
            (asset.order !== undefined && typeof asset.order !== "number") ||
            (asset.media !== undefined && typeof asset.media !== "string")
        )))
  ) {
    throw new ConsoleHostError(
      "invalid_request",
      "Console artifact receipt is invalid"
    );
  }
  try {
    validateConsoleManifest(receipt.manifest);
  } catch {
    throw new ConsoleHostError(
      "invalid_request",
      `Console artifact manifest is invalid: ${receipt.moduleId}`
    );
  }
  if (receipt.manifest.moduleId !== receipt.moduleId) {
    throw new ConsoleHostError(
      "incompatible",
      `Console artifact manifest does not match receipt: ${receipt.moduleId}`
    );
  }
  if (
    !receipt.entries.some(
      (entry) => entry.name.trim() && entry.path === receipt.entry
    )
  ) {
    throw new ConsoleHostError(
      "invalid_request",
      `Console Module UI entry is not declared by the receipt: ${receipt.moduleId}`
    );
  }
  for (const asset of receipt.styleAssets ?? []) {
    artifactAssetUrl(receipt, asset.path, origin);
  }
  artifactEntryUrl(receipt, origin);
}

async function loadStyleAssets(
  receipt: ConsoleUiArtifactReceipt,
  origin = globalThis.location?.origin
): Promise<void> {
  if (
    !receipt.styleAssets?.length ||
    typeof document === "undefined" ||
    document.head === undefined
  ) {
    return;
  }
  const assets = [...receipt.styleAssets].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0)
  );
  for (const asset of assets) {
    const href = artifactAssetUrl(receipt, asset.path, origin);
    const existing = Array.from(
      document.head.querySelectorAll("link[data-lenso-console-artifact-style]")
    ).some(
      (link) =>
        (link as HTMLLinkElement).dataset.lensoConsoleArtifactStyle === href
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
      link.dataset.lensoConsoleArtifactStyle = href;
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener(
        "error",
        () =>
          reject(
            new ConsoleHostError(
              "unavailable",
              `Console Module style asset failed to load: ${asset.path}`,
              { retryable: true, status: 503 }
            )
          ),
        { once: true }
      );
      document.head.append(link);
    });
  }
}

function artifactEntryUrl(
  receipt: ConsoleUiArtifactReceipt,
  origin = globalThis.location?.origin
): string {
  const expectedOrigin =
    origin ?? globalThis.location?.origin ?? "http://lenso.local";
  if (
    receipt.entry.startsWith("/") ||
    receipt.entry.split("/").some((segment) => segment === "..")
  ) {
    throw new ConsoleHostError(
      "invalid_request",
      "Console Module UI entry must be a safe relative path"
    );
  }

  let base: URL;
  let entry: URL;
  try {
    base = new URL(receipt.basePath, expectedOrigin);
    entry = new URL(receipt.entry, base);
  } catch {
    throw new ConsoleHostError(
      "invalid_request",
      "Console Module UI artifact URL is invalid"
    );
  }
  if (base.origin !== entry.origin || entry.origin !== expectedOrigin) {
    throw new ConsoleHostError(
      "forbidden",
      "Console Module UI artifact must be same-origin"
    );
  }
  return `${entry.pathname}${entry.search}${entry.hash}`;
}

function artifactAssetUrl(
  receipt: ConsoleUiArtifactReceipt,
  assetPath: string,
  origin = globalThis.location?.origin
): string {
  if (
    !assetPath ||
    assetPath.startsWith("/") ||
    assetPath.split("/").some((segment) => segment === "..")
  ) {
    throw new ConsoleHostError(
      "invalid_request",
      "Console Module style asset must be a safe relative path"
    );
  }
  if (!receipt.entries.some((entry) => entry.path === assetPath)) {
    throw new ConsoleHostError(
      "invalid_request",
      `Console Module style asset is not declared by the receipt: ${assetPath}`
    );
  }
  const expectedOrigin =
    origin ?? globalThis.location?.origin ?? "http://lenso.local";
  let base: URL;
  let asset: URL;
  try {
    base = new URL(receipt.basePath, expectedOrigin);
    asset = new URL(assetPath, base);
  } catch {
    throw new ConsoleHostError(
      "invalid_request",
      "Console Module style asset URL is invalid"
    );
  }
  if (base.origin !== asset.origin || asset.origin !== expectedOrigin) {
    throw new ConsoleHostError(
      "forbidden",
      "Console Module style asset must be same-origin"
    );
  }
  return `${asset.pathname}${asset.search}${asset.hash}`;
}

function isConsoleUiModuleShape(value: unknown): value is ConsoleUiModule {
  if (!value || typeof value !== "object") {
    return false;
  }
  const module = value as Partial<ConsoleUiModule>;
  return Boolean(
    module.manifest &&
    typeof module.manifest === "object" &&
    Array.isArray(module.surfaces) &&
    module.surfaces.every(
      (surface) =>
        Boolean(surface) &&
        typeof surface === "object" &&
        typeof (surface as { component?: unknown }).component === "function"
    )
  );
}

function manifestsMatch(
  left: ConsoleModuleManifest,
  right: ConsoleModuleManifest
): boolean {
  return (
    left.protocol === right.protocol &&
    left.moduleId === right.moduleId &&
    left.hostApi === right.hostApi &&
    left.consoleUi === right.consoleUi &&
    left.surfaces.length === right.surfaces.length &&
    left.surfaces.every((surface, index) => {
      const expected = right.surfaces[index];
      if (!expected) {
        return false;
      }
      return surfaceFingerprint(surface) === surfaceFingerprint(expected);
    })
  );
}

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
};

function surfaceFingerprint(
  surface: ConsoleModuleManifest["surfaces"][number]
): string {
  return stableSerialize({
    area: surface.area,
    icon: surface.icon ?? null,
    id: surface.id,
    label: surface.label,
    localizedLabels: surface.localizedLabels ?? null,
    navigation: surface.navigation ?? null,
    path: surface.path,
    requiredCapabilities: surface.requiredCapabilities ?? null,
  });
}

async function dynamicImport(url: string): Promise<Record<string, unknown>> {
  /* @vite-ignore */
  return import(url) as Promise<Record<string, unknown>>;
}
