export const CONSOLE_MODULE_API_PROTOCOL = "lenso.console-module.v1" as const;
export const CONSOLE_MODULE_API_VERSION = "1.0.0" as const;

export type ConsoleSha256Digest = `sha256:${string}`;

export const isConsoleSha256Digest = (
  value: unknown
): value is ConsoleSha256Digest =>
  typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);

export type ConsoleSurfaceArea =
  | "runtime"
  | "operations"
  | "data"
  | "configuration";

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

export interface ConsoleWorkspaceRef {
  id: string;
  label: string;
  localizedLabels?: Readonly<Record<string, string>>;
  icon?: string;
}

export interface ConsoleNavigationGroup {
  id: string;
  label: string;
  localizedLabels?: Readonly<Record<string, string>>;
  icon?: string;
  order?: number;
}

export interface ConsoleNavigationMetadata {
  workspace: ConsoleWorkspaceRef;
  group?: ConsoleNavigationGroup;
  order?: number;
}

export interface ConsoleSurfaceManifest {
  id: string;
  path: string;
  label: string;
  area: ConsoleSurfaceArea;
  requiredCapabilities?: readonly string[];
  localizedLabels?: Readonly<Record<string, string>>;
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

export interface ConsoleModuleManifest {
  protocol: typeof CONSOLE_MODULE_API_PROTOCOL;
  moduleId: string;
  hostApi: string;
  consoleUi: string;
  surfaces: readonly ConsoleSurfaceManifest[];
}

export interface ConsoleModuleIdentity {
  readonly moduleId: string;
  readonly moduleReleaseDigest: string;
  readonly uiArtifactDigest: string;
}

export interface ConsoleCapabilities {
  readonly list: () => readonly string[];
  readonly has: (capability: string) => boolean;
}

export interface ConsoleRecord {
  readonly id?: string;
  readonly [key: string]: unknown;
}

export interface ConsoleRecordPage<T extends ConsoleRecord = ConsoleRecord> {
  readonly data: readonly T[];
  readonly page: {
    readonly limit: number;
    readonly nextCursor: string | null;
  };
}

export interface RecordsQueryInput {
  readonly entity: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ConsoleQueryOperation<Result> {
  readonly kind: "query";
  readonly name: string;
  readonly input: unknown;
  readonly result?: Result;
}

export interface ConsoleCommandOperation<Input, Result> {
  readonly kind: "command";
  readonly name: string;
  readonly input: Input;
  readonly result?: Result;
}

export type ConsoleCommandFactory<Input, Result> = (
  input: Input
) => ConsoleCommandOperation<Input, Result>;

const createCommandFactory =
  <Input, Result = unknown>(
    name: string
  ): ConsoleCommandFactory<Input, Result> =>
  (input) => ({
    input,
    kind: "command",
    name,
  });

export const consoleQueries = {
  named<Result>(name: string, input: unknown): ConsoleQueryOperation<Result> {
    return { input, kind: "query", name };
  },
  records<T extends ConsoleRecord = ConsoleRecord>(
    input: RecordsQueryInput
  ): ConsoleQueryOperation<ConsoleRecordPage<T>> {
    return { input, kind: "query", name: "admin.records.list" };
  },
} as const;

export const consoleCommands = {
  action: createCommandFactory,
  named: createCommandFactory,
} as const;

export interface ConsoleClient {
  readonly identity: ConsoleModuleIdentity;
  readonly capabilities: ConsoleCapabilities;
  query<Result>(operation: ConsoleQueryOperation<Result>): Promise<Result>;
  command<Input, Result>(
    operation: ConsoleCommandOperation<Input, Result>,
    options?: { readonly idempotencyKey?: string }
  ): Promise<Result>;
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
