import {
  CONSOLE_UI_COMPOSITION_PROTOCOL,
  defineConsoleThemeBundle,
  defineConsoleThemeBundleManifest,
  defineConsoleUiComposition,
  type ConsoleThemeBundleReceipt,
  type ConsoleThemeBundleManifest,
  type ConsoleThemeVariantMode,
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

export interface ConsoleThemeBundleActivation {
  bundleId: string;
  mode: ConsoleThemeVariantMode;
  tokenOverrides: Readonly<Record<string, string | number>>;
  variantId: string;
  composition?: ConsoleUiComposition;
}

export interface ConsoleThemeBundleActivationTransaction {
  readonly activation: ConsoleThemeBundleActivation;
  commit(): void;
  rollback(): void;
}

const hostConsoleUiMajor = 1;
let themeStyleTransactionSequence = 0;

const embeddedOfficialDefaultManifest = {
  assets: [],
  bundleId: "lenso/default",
  consoleUi: "^1.0.0",
  defaultVariant: "dark",
  displayName: "Lenso Official Default",
  format: "console_theme_bundle",
  tokenOverrides: {},
  variants: [
    { id: "dark", label: "Dark", mode: "dark" },
    { id: "light", label: "Light", mode: "light" },
  ],
  version: "1.0.0",
} as const satisfies ConsoleThemeBundleManifest;

/**
 * The recovery bundle is deliberately part of the Host build. It uses the
 * same public composition contract as an installed bundle but has no external
 * artifact or same-origin load dependency.
 */
export const embeddedOfficialDefaultThemeBundle = defineConsoleThemeBundle(
  defineConsoleThemeBundleManifest(embeddedOfficialDefaultManifest),
  defineConsoleUiComposition({
    consoleUi: "^1.0.0",
    protocol: CONSOLE_UI_COMPOSITION_PROTOCOL,
  })
);

export function createConsoleThemeBundleActivation(
  bundle: {
    manifest: ConsoleThemeBundleManifest;
    composition: ConsoleUiComposition | undefined;
  },
  variantId: string
): ConsoleThemeBundleActivation {
  const variant = bundle.manifest.variants.find(
    (candidate) => candidate.id === variantId
  );
  if (!variant) {
    throw new ConsoleHostError(
      "incompatible",
      `Console Theme Bundle variant is not declared: ${bundle.manifest.bundleId}/${variantId}`
    );
  }
  return {
    bundleId: bundle.manifest.bundleId,
    mode: variant.mode,
    tokenOverrides: {
      ...bundle.manifest.tokenOverrides,
      ...variant.tokenOverrides,
    },
    variantId: variant.id,
    ...(bundle.composition ? { composition: bundle.composition } : {}),
  };
}

export async function prepareConsoleThemeBundleActivation(
  receipt: ConsoleThemeBundleReceipt,
  options: ConsoleThemeBundleRuntimeOptions = {}
): Promise<ConsoleThemeBundleActivationTransaction> {
  validateReceipt(receipt, options.origin);
  const variantId = options.variantId ?? receipt.manifest.defaultVariant;
  const styleTransaction = await stageStyleAssets(
    receipt,
    options.origin,
    variantId
  );

  try {
    const composition = await loadComposition(receipt, options);
    const activation = createConsoleThemeBundleActivation(
      { manifest: receipt.manifest, composition },
      variantId
    );
    let state: "prepared" | "committed" | "rolled_back" = "prepared";
    return {
      activation,
      commit() {
        if (state !== "prepared") {
          return;
        }
        styleTransaction.commit();
        state = "committed";
      },
      rollback() {
        if (state === "rolled_back") {
          return;
        }
        styleTransaction.rollback();
        state = "rolled_back";
      },
    };
  } catch (error: unknown) {
    styleTransaction.rollback();
    throw error;
  }
}

export async function loadConsoleThemeBundle(
  receipt: ConsoleThemeBundleReceipt,
  options: ConsoleThemeBundleRuntimeOptions = {}
): Promise<{
  manifest: ConsoleThemeBundleReceipt["manifest"];
  composition?: ConsoleUiComposition;
}> {
  const transaction = await prepareConsoleThemeBundleActivation(
    receipt,
    options
  );
  transaction.commit();
  const loadedBundle = transaction.activation.composition
    ? {
        manifest: receipt.manifest,
        composition: transaction.activation.composition,
      }
    : { manifest: receipt.manifest };
  return loadedBundle;
}

async function loadComposition(
  receipt: ConsoleThemeBundleReceipt,
  options: ConsoleThemeBundleRuntimeOptions
): Promise<ConsoleUiComposition | undefined> {
  if (!receipt.manifest.composition) {
    return undefined;
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
    const validatedComposition = defineConsoleUiComposition(
      composition as ConsoleUiComposition
    );
    if (validatedComposition.consoleUi !== receipt.manifest.consoleUi) {
      throw new TypeError(
        "Composition Console UI range does not match manifest"
      );
    }
    const bundle = defineConsoleThemeBundle(
      receipt.manifest,
      validatedComposition
    );
    return bundle.composition;
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
  if (!consoleUiRangeSupportsHost(receipt.manifest.consoleUi)) {
    throw new ConsoleHostError(
      "incompatible",
      `Console Theme Bundle requires unsupported Console UI range: ${receipt.manifest.consoleUi}`
    );
  }
  artifactUrl(
    receipt,
    receipt.manifest.composition?.entry ?? receipt.entries[0]!.path,
    origin
  );
}

async function stageStyleAssets(
  receipt: ConsoleThemeBundleReceipt,
  origin?: string,
  variantId?: string
): Promise<{ commit(): void; rollback(): void }> {
  if (typeof document === "undefined" || !document.head) {
    return {
      commit: () => undefined,
      rollback: () => undefined,
    };
  }
  const assets = receipt.manifest.assets
    .filter(
      (asset) =>
        asset.kind === "style" &&
        (asset.variantId === undefined || asset.variantId === variantId)
    )
    .toSorted((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const transactionId = `theme-${(themeStyleTransactionSequence += 1)}`;
  const stagedLinks: HTMLLinkElement[] = [];
  const removeStagedLinks = () => {
    for (const link of stagedLinks) {
      link.remove();
    }
  };
  const existingHrefs = new Set(
    Array.from(
      document.head.querySelectorAll("link[data-lenso-console-theme-style]")
    )
      .filter(
        (link) =>
          (link as HTMLLinkElement).dataset.lensoConsoleThemeStyleState !==
          "staged"
      )
      .map((link) => (link as HTMLLinkElement).dataset.lensoConsoleThemeStyle)
  );
  const nextHrefs = new Set<string>();
  try {
    for (const asset of assets) {
      const href = artifactUrl(receipt, asset.path, origin);
      nextHrefs.add(href);
      if (existingHrefs.has(href)) {
        continue;
      }
      const link = await appendStagedStyleLink(href, asset, transactionId);
      stagedLinks.push(link);
    }
  } catch (error: unknown) {
    removeStagedLinks();
    throw error;
  }

  return {
    commit() {
      for (const link of stagedLinks) {
        const media = link.dataset.lensoConsoleThemeStyleMedia;
        if (media) {
          link.media = media;
        } else {
          link.removeAttribute("media");
        }
        delete link.dataset.lensoConsoleThemeStyleMedia;
        delete link.dataset.lensoConsoleThemeStyleState;
        delete link.dataset.lensoConsoleThemeStyleOwner;
      }
      for (const link of Array.from(
        document.head.querySelectorAll("link[data-lenso-console-theme-style]")
      )) {
        if (
          (link as HTMLLinkElement).dataset.lensoConsoleThemeStyleState ===
          "staged"
        ) {
          continue;
        }
        const href = (link as HTMLLinkElement).dataset.lensoConsoleThemeStyle;
        if (href && !nextHrefs.has(href)) {
          link.remove();
        }
      }
    },
    rollback() {
      removeStagedLinks();
    },
  };
}

async function appendStagedStyleLink(
  href: string,
  asset: ConsoleThemeBundleReceipt["manifest"]["assets"][number],
  transactionId: string
): Promise<HTMLLinkElement> {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.media = "not all";
  link.dataset.lensoConsoleThemeStyle = href;
  link.dataset.lensoConsoleThemeStyleState = "staged";
  link.dataset.lensoConsoleThemeStyleOwner = transactionId;
  if (asset.media) {
    link.dataset.lensoConsoleThemeStyleMedia = asset.media;
  }
  const loaded = new Promise<void>((resolve, reject) => {
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
  });
  document.head.append(link);
  try {
    await loaded;
  } catch (error: unknown) {
    link.remove();
    throw error;
  }
  return link;
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

function consoleUiRangeSupportsHost(range: string): boolean {
  const match = /^\s*(?:\^|~|>=|<=|>|<|=)?\s*(\d+)/u.exec(range);
  return match !== null && Number(match[1]) === hostConsoleUiMajor;
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
