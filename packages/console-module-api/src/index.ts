import { CONSOLE_MODULE_PROTOCOL } from "./contracts";
import type {
  ConsoleSha256Digest,
  FrameworkConsoleModuleManifest,
  FrameworkConsoleModuleSurface,
  FrameworkConsoleNavigation,
  FrameworkConsoleNavigationGroup,
  FrameworkConsoleWorkspaceRef,
  ActionContributionResolution,
  ActionContributionResolutionRequest,
  ManagedServiceContext,
  ModuleConfigReadRequest,
  ModuleConfigReadResponse,
  ModuleConfigWriteRequest,
  ModuleConfigWriteResponse,
  ModuleInventoryRequest,
  ModuleInventorySnapshot,
  SurfaceApiClient,
} from "./contracts";

export * from "./contracts";

export const CONSOLE_MODULE_API_PROTOCOL = CONSOLE_MODULE_PROTOCOL;
export const CONSOLE_MODULE_API_VERSION = "2.0.0" as const;

export type ConsoleSurfaceIcon =
  | "activity"
  | "blocks"
  | "boxes"
  | "chrome"
  | "database"
  | "git-compare-arrows"
  | "github"
  | "house"
  | "key-round"
  | "network"
  | "rocket"
  | "server-cog"
  | "shield"
  | "settings"
  | "smartphone"
  | "users"
  | "workflow";

export type ConsoleSurfaceArea = FrameworkConsoleModuleSurface["area"];
export type ConsoleWorkspaceRef = FrameworkConsoleWorkspaceRef;
export type ConsoleNavigationGroup = FrameworkConsoleNavigationGroup;
export type ConsoleNavigationMetadata = FrameworkConsoleNavigation;
export type ConsoleSurfaceManifest = FrameworkConsoleModuleSurface;
export type ConsoleModuleManifest = FrameworkConsoleModuleManifest;

export interface ConsoleModuleIdentity {
  readonly moduleId: string;
  readonly moduleReleaseDigest: ConsoleSha256Digest;
  readonly uiArtifactDigest: ConsoleSha256Digest;
}

export interface ConsoleCapabilities {
  readonly list: () => readonly string[];
  readonly has: (capability: string) => boolean;
}

export interface ConsoleClient {
  readonly identity: ConsoleModuleIdentity;
  readonly capabilities: ConsoleCapabilities;
  readonly managedServiceContext: ManagedServiceContext;
  /** Invoke only operations granted by the selected Surface artifact. */
  readonly surfaceApi: SurfaceApiClient;
  /** Read the authoritative inventory from the selected Managed Service. */
  inventory(request: ModuleInventoryRequest): Promise<ModuleInventorySnapshot>;
  /** Resolve declarative, data-only Action Contributions from the target. */
  resolveActionContributions(
    request: ActionContributionResolutionRequest
  ): Promise<ActionContributionResolution>;
  /** Read only descriptor-declared configuration keys. */
  readConfig(
    request: ModuleConfigReadRequest
  ): Promise<ModuleConfigReadResponse>;
  /** Write descriptor-declared configuration and return audit evidence. */
  writeConfig(
    request: ModuleConfigWriteRequest
  ): Promise<ModuleConfigWriteResponse>;
  navigate(path: string, options?: { readonly replace?: boolean }): void;
}

export type ConsoleHostErrorCode =
  | "aborted"
  | "capability_denied"
  | "conflict"
  | "forbidden"
  | "incompatible"
  | "invalid_request"
  | "not_found"
  | "unavailable";

export class ConsoleHostError extends Error {
  readonly code: ConsoleHostErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(
    code: ConsoleHostErrorCode,
    message: string,
    { retryable = false, status }: { retryable?: boolean; status?: number } = {}
  ) {
    super(message);
    this.name = "ConsoleHostError";
    this.code = code;
    this.retryable = retryable;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validSurfacePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.includes("\\") &&
  !value.includes("?") &&
  !value.includes("#") &&
  !value.split("/").some((segment) => segment === "..");

const validSurfaceArea = (value: unknown): value is ConsoleSurfaceArea =>
  value === "runtime" ||
  value === "operations" ||
  value === "data" ||
  value === "configuration";

const validateManifestSurface = (
  surface: ConsoleSurfaceManifest,
  ids: Set<string>,
  paths: Set<string>
): void => {
  if (
    !surface ||
    typeof surface !== "object" ||
    !nonEmpty(surface.id) ||
    !nonEmpty(surface.label) ||
    !validSurfaceArea(surface.area) ||
    ids.has(surface.id)
  ) {
    const surfaceId =
      surface && typeof surface === "object" && "id" in surface
        ? String(surface.id)
        : "<unknown>";
    throw new TypeError(
      `Console surface id is empty or duplicated: ${surfaceId}`
    );
  }
  if (!validSurfacePath(surface.path) || paths.has(surface.path)) {
    throw new TypeError(
      `Console surface path is invalid or duplicated: ${surface.path}`
    );
  }
  ids.add(surface.id);
  paths.add(surface.path);
};

export const validateConsoleManifest = (
  manifest: ConsoleModuleManifest
): void => {
  if (!manifest || typeof manifest !== "object") {
    throw new TypeError("Console Module manifest is required");
  }
  if (manifest.protocol !== CONSOLE_MODULE_API_PROTOCOL) {
    throw new TypeError(
      `Unsupported Console Module protocol: ${manifest.protocol}`
    );
  }
  if (!nonEmpty(manifest.moduleId)) {
    throw new TypeError("Console Module id must be non-empty");
  }
  if (!nonEmpty(manifest.hostApi) || !nonEmpty(manifest.consoleUi)) {
    throw new TypeError("Console Module API and UI versions are required");
  }
  if (!Array.isArray(manifest.surfaces) || manifest.surfaces.length === 0) {
    throw new TypeError("Console Module must declare at least one surface");
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const surface of manifest.surfaces) {
    validateManifestSurface(surface, ids, paths);
  }
};

export const defineConsoleManifest = <
  const Manifest extends ConsoleModuleManifest,
>(
  manifest: Manifest
): Manifest => {
  validateConsoleManifest(manifest);
  return manifest;
};
