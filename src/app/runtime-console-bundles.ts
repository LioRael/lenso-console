import type { ConsoleModule } from "./console-module-api";
import {
  defineInstalledConsolePackage,
  type InstalledConsolePackage,
} from "./console-package-registry";

export const CONSOLE_BUNDLE_HOST_API = "1";
export const DEFAULT_CONSOLE_BUNDLE_REGISTRY_URL =
  "/console/extensions/registry.json";

export type RuntimeConsoleBundleManifest = {
  packageName: string;
  exportName: string;
  entry: string;
  hostApi: string;
  version?: string;
  requiredCapabilities?: readonly string[];
};

export type RuntimeConsoleBundleRegistry = {
  version: 1;
  bundles: readonly RuntimeConsoleBundleManifest[];
};

export type RuntimeConsoleBundleImport = (
  entryUrl: string
) => Promise<Record<string, unknown>>;

type RuntimeConsoleBundleOptions = {
  availableCapabilities?: readonly string[];
  importModule?: RuntimeConsoleBundleImport;
  origin?: string;
};

type RuntimeConsoleBundleRegistryOptions = RuntimeConsoleBundleOptions & {
  fetchJson?: typeof fetch;
};

export async function loadRuntimeConsoleBundlePackages(
  registryUrl = DEFAULT_CONSOLE_BUNDLE_REGISTRY_URL,
  options: RuntimeConsoleBundleRegistryOptions = {}
): Promise<InstalledConsolePackage[]> {
  const fetchJson = options.fetchJson ?? fetch;
  const response = await fetchJson(registryUrl, {
    headers: { accept: "application/json" },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 404 || !contentType.includes("application/json")) {
    return [];
  }
  if (!response.ok) {
    throw new Error(
      `Console bundle registry request failed: ${response.status}`
    );
  }
  return runtimeConsoleBundlePackages(
    (await response.json()) as RuntimeConsoleBundleRegistry,
    options
  );
}

export async function runtimeConsoleBundlePackages(
  registry: RuntimeConsoleBundleRegistry,
  options: RuntimeConsoleBundleOptions = {}
): Promise<InstalledConsolePackage[]> {
  return Promise.all(
    registry.bundles
      .filter((bundle) =>
        bundleHasCapabilities(bundle, options.availableCapabilities)
      )
      .map((bundle) => runtimeConsoleBundlePackage(bundle, options))
  );
}

async function runtimeConsoleBundlePackage(
  bundle: RuntimeConsoleBundleManifest,
  options: RuntimeConsoleBundleOptions
): Promise<InstalledConsolePackage> {
  if (bundle.hostApi !== CONSOLE_BUNDLE_HOST_API) {
    throw new Error(
      `${bundle.packageName} requires console host API ${bundle.hostApi}; host supports ${CONSOLE_BUNDLE_HOST_API}`
    );
  }
  const entryUrl = sameOriginEntryUrl(bundle.entry, options.origin);
  const importModule = options.importModule ?? dynamicImport;
  const imported = await importModule(entryUrl);
  const module = consoleModuleExport(imported, bundle.exportName);
  const declaration: Parameters<typeof defineInstalledConsolePackage>[0] = {
    manifest: {
      exportName: bundle.exportName,
      packageName: bundle.packageName,
    },
    module,
    source: "runtime_bundle",
  };
  if (bundle.version) {
    declaration.version = bundle.version;
  }
  return defineInstalledConsolePackage(declaration);
}

function bundleHasCapabilities(
  bundle: RuntimeConsoleBundleManifest,
  availableCapabilities?: readonly string[]
): boolean {
  if (!availableCapabilities) {
    return true;
  }
  const available = new Set(availableCapabilities);
  return (bundle.requiredCapabilities ?? []).every((capability) =>
    available.has(capability)
  );
}

function sameOriginEntryUrl(
  entry: string,
  origin = globalThis.location.origin
) {
  const url = new URL(entry, origin);
  if (url.origin !== origin) {
    throw new Error(`Console bundle entry must be same-origin: ${entry}`);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function consoleModuleExport(
  imported: Record<string, unknown>,
  exportName: string
): ConsoleModule {
  const value = imported[exportName];
  if (!isConsoleModule(value)) {
    throw new Error(
      `Console bundle export is not a console module: ${exportName}`
    );
  }
  return value;
}

function isConsoleModule(value: unknown): value is ConsoleModule {
  if (!value || typeof value !== "object") {
    return false;
  }
  const module = value as Partial<ConsoleModule>;
  return (
    typeof module.id === "string" &&
    Array.isArray(module.surfaces) &&
    module.surfaces.every(
      (surface) =>
        surface &&
        typeof surface.path === "string" &&
        typeof surface.label === "string" &&
        typeof surface.area === "string" &&
        typeof surface.component === "function"
    )
  );
}

async function dynamicImport(
  entryUrl: string
): Promise<Record<string, unknown>> {
  return import(/* @vite-ignore */ entryUrl) as Promise<
    Record<string, unknown>
  >;
}
