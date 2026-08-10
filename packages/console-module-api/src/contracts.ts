/**
 * Framework-owned Console contracts.
 *
 * These types intentionally mirror the published `lenso@0.3.38` wire names.
 * Console host code may add local receipt metadata, but it must not invent a
 * second artifact or Managed Service operation schema at this boundary.
 */

export const CONSOLE_MODULE_PROTOCOL = "lenso.console-module.v1" as const;
export const CONSOLE_MODULE_PROTOCOL_MAJOR = 1 as const;
export const CONSOLE_UI_ESM_FORMAT = "console_ui_esm" as const;
export const CONSOLE_BRIDGE_PROTOCOL = "lenso.console-bridge.v1" as const;
export const CONSOLE_HOST_API_VERSION = "2.1.0" as const;
export const CONSOLE_UI_VERSION = "2.0.0" as const;

export const MODULE_OPERATIONS_PROTOCOL =
  "lenso.system-plane.module-operations.v1" as const;
export const MODULE_OPERATIONS_PATH = "/system-plane/v1/modules" as const;
export const CONSOLE_SURFACE_GATEWAY_PROTOCOL =
  "lenso.console-surface-gateway.v1" as const;

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

/** Exact framework manifest navigation types. Localized labels are host UI metadata. */
export interface FrameworkConsoleWorkspaceRef {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

export interface FrameworkConsoleNavigationGroup {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly order?: number;
}

export interface FrameworkConsoleNavigation {
  readonly workspace: FrameworkConsoleWorkspaceRef;
  readonly group?: FrameworkConsoleNavigationGroup;
  readonly order?: number;
}

export interface FrameworkConsoleModuleSurface {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly area: ConsoleSurfaceArea;
  readonly requiredCapabilities?: readonly string[];
  readonly icon?: string;
  readonly navigation?: FrameworkConsoleNavigation;
}

export interface FrameworkConsoleModuleManifest {
  readonly protocol: typeof CONSOLE_MODULE_PROTOCOL;
  readonly moduleId: string;
  readonly hostApi: string;
  readonly consoleUi: string;
  readonly surfaces: readonly FrameworkConsoleModuleSurface[];
}

export interface FrameworkArtifactReference {
  readonly locator: string;
  readonly digest: ConsoleSha256Digest;
}

export interface FrameworkConsoleUiArtifactEntry {
  readonly name: string;
  readonly path: string;
}

export interface FrameworkConsoleUiArtifactStyleAsset {
  readonly path: string;
  readonly order?: number;
  readonly media?: string;
}

export interface FrameworkConsolePermissionRequest {
  readonly permissionId: string;
  readonly operations?: readonly string[];
  readonly resources?: readonly string[];
  readonly outboundDestinations?: readonly string[];
  readonly secretReferences?: readonly string[];
}

export interface FrameworkConsoleUiEsmArtifact {
  readonly artifact: FrameworkArtifactReference;
  readonly format: typeof CONSOLE_UI_ESM_FORMAT;
  readonly protocolMajor: typeof CONSOLE_MODULE_PROTOCOL_MAJOR;
  readonly entry: string;
  readonly entries?: readonly FrameworkConsoleUiArtifactEntry[];
  readonly styleAssets?: readonly FrameworkConsoleUiArtifactStyleAsset[];
  readonly manifest: FrameworkConsoleModuleManifest;
  readonly requestedPermissions?: readonly FrameworkConsolePermissionRequest[];
  readonly provenance?: readonly FrameworkArtifactReference[];
}

export interface FrameworkModuleCompatibilityDeclaration {
  readonly lenso_requirement?: string;
  readonly host_api_requirement?: string;
  readonly console_ui_requirement?: string;
  readonly rust_requirement?: string;
  readonly targets?: readonly string[];
  readonly transports?: readonly string[];
  readonly protocol_digests?: readonly string[];
}

/** The release fields needed by the Console. `manifest` remains framework-owned. */
export interface FrameworkModuleRelease {
  readonly protocol: "lenso.module-release.v1";
  readonly module_id: string;
  readonly version: string;
  readonly manifest: Record<string, unknown>;
  readonly manifest_digest: ConsoleSha256Digest;
  readonly delivery: Record<string, unknown>;
  readonly console_ui_artifact?: FrameworkConsoleUiEsmArtifact;
  readonly compatibility?: FrameworkModuleCompatibilityDeclaration;
  readonly provenance?: readonly FrameworkArtifactReference[];
}

export interface ManagedServiceContext {
  readonly systemId: string;
  readonly serviceId: string;
  readonly environmentId: string;
  readonly targetServicePrincipal: string;
  readonly callerModuleId: string;
  readonly delegatedActorSubject: string;
  readonly delegatedAuthorityDigest: ConsoleSha256Digest;
  readonly capabilities: readonly string[];
}

export interface SurfaceStoryContext {
  readonly storyId: string;
  readonly segmentId?: string;
  readonly correlationId?: string;
}

export interface SurfaceOperationRequestContext {
  readonly tenantId?: string;
  readonly deadlineUnixMs: number;
  readonly idempotencyKey?: string;
  readonly story?: SurfaceStoryContext;
}

/**
 * The only request shape a Console Surface may send to a Module Business API.
 * The host resolves the connected implementation from the committed contract;
 * callers never provide a URL, method, target header, or target credential.
 */
export interface SurfaceOperationRequest<Input = unknown> {
  readonly protocol: typeof CONSOLE_SURFACE_GATEWAY_PROTOCOL;
  readonly moduleId: string;
  readonly moduleReleaseDigest: ConsoleSha256Digest;
  readonly uiArtifactDigest: ConsoleSha256Digest;
  readonly contractDigest: ConsoleSha256Digest;
  readonly operationId: string;
  readonly input: Input;
  readonly context: ManagedServiceContext;
  readonly requestContext: SurfaceOperationRequestContext;
}

export interface SurfaceOperationResponse<Output = unknown> {
  readonly protocol: typeof CONSOLE_SURFACE_GATEWAY_PROTOCOL;
  readonly moduleId: string;
  readonly contractDigest: ConsoleSha256Digest;
  readonly operationId: string;
  readonly output: Output;
  readonly requestContext: SurfaceOperationRequestContext;
}

export interface SurfaceApiClient {
  invoke<Input, Output>(
    request: SurfaceOperationRequest<Input>
  ): Promise<SurfaceOperationResponse<Output>>;
}

export interface ModuleInventoryRequest {
  readonly context: ManagedServiceContext;
}

export type ModuleInventoryDelivery = "linked" | "service";
export type ModuleRuntimeStatus = "active" | "disabled" | "degraded" | "failed";

export interface ModuleInventoryConsoleUi {
  readonly format: typeof CONSOLE_UI_ESM_FORMAT;
  readonly protocolMajor: number;
  readonly artifactDigest: ConsoleSha256Digest;
  readonly entry: string;
  readonly styleAssets?: readonly string[];
}

export interface ModuleInventoryModule {
  readonly moduleId: string;
  readonly version: string;
  readonly releaseDigest: ConsoleSha256Digest;
  readonly manifestDigest: ConsoleSha256Digest;
  readonly delivery: ModuleInventoryDelivery;
  readonly dependencyModuleIds?: readonly string[];
  readonly routes?: readonly {
    readonly method: string;
    readonly path: string;
    readonly capability?: string;
  }[];
  readonly runtimeFunctions?: readonly string[];
  readonly runtimeStatus: ModuleRuntimeStatus;
  readonly consoleUi?: ModuleInventoryConsoleUi;
}

export interface ModuleInventorySnapshot {
  readonly protocol: typeof MODULE_OPERATIONS_PROTOCOL;
  readonly context: ManagedServiceContext;
  readonly serviceRevision: string;
  readonly snapshotRevision: ConsoleSha256Digest;
  readonly schemaDigest: ConsoleSha256Digest;
  readonly modules: readonly ModuleInventoryModule[];
}

export interface ActionContributionResolutionRequest {
  readonly context: ManagedServiceContext;
  readonly slot: string;
  readonly slotVersion: number;
  readonly slotContext?: Readonly<Record<string, unknown>>;
}

export interface ResolvedActionContribution {
  readonly contributingModuleId: string;
  readonly target: string;
  readonly targetVersion: number;
  readonly label: string;
  readonly action: {
    readonly contractId: string;
    readonly contractVersion: string;
    readonly operationId: string;
    readonly inputBindings?: readonly {
      readonly input: string;
      readonly value: { readonly kind: "slot_context"; readonly path: string };
    }[];
  };
  readonly icon?: string;
  readonly requiredCapabilities?: readonly string[];
}

export interface ActionContributionResolution {
  readonly protocol: typeof MODULE_OPERATIONS_PROTOCOL;
  readonly context: ManagedServiceContext;
  readonly slot: string;
  readonly slotVersion: number;
  readonly contributions: readonly ResolvedActionContribution[];
}

export type ModuleConfigFieldType = "string" | "integer" | "boolean" | "json";
export type ModuleConfigScope = "module" | "service" | "environment";
export type ModuleConfigMutability = "static" | "reloadable" | "runtime";
export type ModuleConfigActivation =
  | "none"
  | "build"
  | "restart"
  | "service_restart";

export interface ModuleConfigReadRequest {
  readonly context: ManagedServiceContext;
  readonly moduleId: string;
  readonly keys?: readonly string[];
}

export interface ModuleConfigValue {
  readonly key: string;
  readonly fieldType: ModuleConfigFieldType;
  readonly scope: ModuleConfigScope;
  readonly mutability: ModuleConfigMutability;
  readonly activation: ModuleConfigActivation;
  readonly sensitive: boolean;
  readonly present: boolean;
  /** The framework omits `value` for sensitive fields, including when present. */
  readonly value?: unknown;
}

export interface ModuleConfigReadResponse {
  readonly protocol: typeof MODULE_OPERATIONS_PROTOCOL;
  readonly context: ManagedServiceContext;
  readonly moduleId: string;
  readonly values: readonly ModuleConfigValue[];
}

export interface ModuleConfigWriteRequest {
  readonly context: ManagedServiceContext;
  readonly moduleId: string;
  readonly values: readonly { readonly key: string; readonly value: unknown }[];
}

export interface ModuleConfigAuditEvidence {
  readonly sequence: number;
  readonly operationId: string;
  readonly moduleId: string;
  readonly key: string;
  readonly sensitive: boolean;
  readonly oldValueDigest?: ConsoleSha256Digest;
  readonly newValueDigest: ConsoleSha256Digest;
  readonly recordedAtUnixMs: number;
}

export interface ModuleConfigWriteResponse {
  readonly protocol: typeof MODULE_OPERATIONS_PROTOCOL;
  readonly operationId: string;
  readonly context: ManagedServiceContext;
  readonly moduleId: string;
  readonly targetRevisionBefore: string;
  readonly targetRevisionAfter: string;
  readonly authorizationDigest: ConsoleSha256Digest;
  readonly evidence: readonly ModuleConfigAuditEvidence[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const safeRelativePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  value
    .split("/")
    .every(
      (segment) => segment.length > 0 && segment !== "." && segment !== ".."
    );

const safeSurfacePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith("/") &&
  value.length > 1 &&
  !value.includes("\\") &&
  !value.includes("?") &&
  !value.includes("#") &&
  value
    .slice(1)
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "..");

const validModuleId = (value: string): boolean =>
  /^[a-z][a-z0-9_-]*\/[a-z][a-z0-9_-]*$/u.test(value);

const sortedUniqueNonEmpty = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every(nonEmpty) &&
  value.every((item, index) => index === 0 || item > (value[index - 1] ?? ""));

const assertExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string
): void => {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw new TypeError(`${label} contains an unsupported field: ${unknown}`);
  }
};

// The framework contract validator intentionally keeps all shape checks at this boundary.
// eslint-disable-next-line complexity
export const validateFrameworkConsoleModuleManifest = (
  manifest: FrameworkConsoleModuleManifest
): void => {
  if (!isRecord(manifest)) {
    throw new TypeError("Framework Console Module manifest is required");
  }
  assertExactKeys(
    manifest,
    ["protocol", "moduleId", "hostApi", "consoleUi", "surfaces"],
    "Console Module manifest"
  );
  if (manifest.protocol !== CONSOLE_MODULE_PROTOCOL) {
    throw new TypeError(
      `Unsupported Console Module protocol: ${String(manifest.protocol)}`
    );
  }
  if (
    !nonEmpty(manifest.moduleId) ||
    !validModuleId(manifest.moduleId) ||
    !nonEmpty(manifest.hostApi) ||
    !nonEmpty(manifest.consoleUi)
  ) {
    throw new TypeError(
      "Console Module identity and compatibility ranges are required"
    );
  }
  if (!Array.isArray(manifest.surfaces) || manifest.surfaces.length === 0) {
    throw new TypeError("Console Module must declare at least one surface");
  }
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const surface of manifest.surfaces) {
    if (!isRecord(surface)) {
      throw new TypeError("Console Module surface must be an object");
    }
    assertExactKeys(
      surface,
      [
        "id",
        "path",
        "label",
        "area",
        "requiredCapabilities",
        "icon",
        "navigation",
      ],
      "Console Module surface"
    );
    if (
      !nonEmpty(surface.id) ||
      !nonEmpty(surface.label) ||
      ids.has(surface.id)
    ) {
      throw new TypeError(
        "Console Module surface ids must be non-empty and unique"
      );
    }
    if (!safeSurfacePath(surface.path) || paths.has(surface.path)) {
      throw new TypeError(
        "Console Module surface paths must be absolute and unique"
      );
    }
    if (
      !["runtime", "operations", "data", "configuration"].includes(
        surface.area as string
      )
    ) {
      throw new TypeError("Console Module surface area is invalid");
    }
    if (
      surface.requiredCapabilities !== undefined &&
      !sortedUniqueNonEmpty(surface.requiredCapabilities)
    ) {
      throw new TypeError("Console Module surface capabilities are invalid");
    }
    if (surface.icon !== undefined && typeof surface.icon !== "string") {
      throw new TypeError("Console Module surface icon is invalid");
    }
    if (surface.navigation !== undefined) {
      if (!isRecord(surface.navigation)) {
        throw new TypeError("Console Module surface navigation is invalid");
      }
      assertExactKeys(
        surface.navigation,
        ["workspace", "group", "order"],
        "Console Module navigation"
      );
      if (!isRecord(surface.navigation.workspace)) {
        throw new TypeError("Console Module navigation workspace is invalid");
      }
      assertExactKeys(
        surface.navigation.workspace,
        ["id", "label", "icon"],
        "Console Module navigation workspace"
      );
      if (
        !nonEmpty(surface.navigation.workspace.id) ||
        !nonEmpty(surface.navigation.workspace.label) ||
        (surface.navigation.workspace.icon !== undefined &&
          typeof surface.navigation.workspace.icon !== "string")
      ) {
        throw new TypeError("Console Module navigation workspace is invalid");
      }
      if (surface.navigation.group !== undefined) {
        if (!isRecord(surface.navigation.group)) {
          throw new TypeError("Console Module navigation group is invalid");
        }
        assertExactKeys(
          surface.navigation.group,
          ["id", "label", "icon", "order"],
          "Console Module navigation group"
        );
        if (
          !nonEmpty(surface.navigation.group.id) ||
          !nonEmpty(surface.navigation.group.label) ||
          (surface.navigation.group.icon !== undefined &&
            typeof surface.navigation.group.icon !== "string") ||
          (surface.navigation.group.order !== undefined &&
            !Number.isInteger(surface.navigation.group.order))
        ) {
          throw new TypeError("Console Module navigation group is invalid");
        }
      }
      if (
        surface.navigation.order !== undefined &&
        !Number.isInteger(surface.navigation.order)
      ) {
        throw new TypeError("Console Module navigation order is invalid");
      }
    }
    ids.add(surface.id);
    paths.add(surface.path);
  }
};

// The framework contract validator intentionally keeps all shape checks at this boundary.
// eslint-disable-next-line complexity
export const validateConsoleUiEsmArtifact = (
  artifact: FrameworkConsoleUiEsmArtifact
): void => {
  if (!isRecord(artifact)) {
    throw new TypeError("Console UI ESM artifact is required");
  }
  assertExactKeys(
    artifact,
    [
      "artifact",
      "format",
      "protocolMajor",
      "entry",
      "entries",
      "styleAssets",
      "manifest",
      "requestedPermissions",
      "provenance",
    ],
    "Console UI ESM artifact"
  );
  if (!isRecord(artifact.artifact)) {
    throw new TypeError("Console UI artifact reference is required");
  }
  assertExactKeys(
    artifact.artifact,
    ["locator", "digest"],
    "Console UI artifact reference"
  );
  if (
    !nonEmpty(artifact.artifact.locator) ||
    !isConsoleSha256Digest(artifact.artifact.digest)
  ) {
    throw new TypeError("Console UI artifact reference is invalid");
  }
  if (
    artifact.format !== CONSOLE_UI_ESM_FORMAT ||
    artifact.protocolMajor !== CONSOLE_MODULE_PROTOCOL_MAJOR
  ) {
    throw new TypeError(
      "Console UI artifact format or protocol major is unsupported"
    );
  }
  validateFrameworkConsoleModuleManifest(artifact.manifest);
  if (!safeRelativePath(artifact.entry)) {
    throw new TypeError(
      "Console UI artifact entry must be a safe relative path"
    );
  }
  if (artifact.entries !== undefined && !Array.isArray(artifact.entries)) {
    throw new TypeError("Console UI artifact entries must be an array");
  }
  const entries = artifact.entries ?? [];
  if (entries.length === 0) {
    throw new TypeError("Console UI artifact must declare entries");
  }
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const entry of entries) {
    if (!isRecord(entry)) {
      throw new TypeError("Console UI artifact entry must be an object");
    }
    assertExactKeys(entry, ["name", "path"], "Console UI artifact entry");
    if (
      !nonEmpty(entry.name) ||
      !safeRelativePath(entry.path) ||
      names.has(entry.name) ||
      paths.has(entry.path)
    ) {
      throw new TypeError(
        "Console UI artifact entries must be safe and unique"
      );
    }
    names.add(entry.name);
    paths.add(entry.path);
  }
  if (!paths.has(artifact.entry)) {
    throw new TypeError("Console UI artifact entry is not declared in entries");
  }
  if (
    artifact.styleAssets !== undefined &&
    !Array.isArray(artifact.styleAssets)
  ) {
    throw new TypeError("Console UI style assets must be an array");
  }
  const stylePaths = new Set<string>();
  for (const asset of artifact.styleAssets ?? []) {
    if (!isRecord(asset)) {
      throw new TypeError("Console UI style asset must be an object");
    }
    assertExactKeys(
      asset,
      ["path", "order", "media"],
      "Console UI style asset"
    );
    if (
      !safeRelativePath(asset.path) ||
      !paths.has(asset.path) ||
      stylePaths.has(asset.path) ||
      (asset.order !== undefined && !Number.isInteger(asset.order)) ||
      (asset.media !== undefined && !nonEmpty(asset.media))
    ) {
      throw new TypeError(
        "Console UI style assets must be declared artifact entries"
      );
    }
    stylePaths.add(asset.path);
  }
  if (
    artifact.requestedPermissions !== undefined &&
    !Array.isArray(artifact.requestedPermissions)
  ) {
    throw new TypeError("Console UI requested permissions must be an array");
  }
  const permissionIds = new Set<string>();
  for (const permission of artifact.requestedPermissions ?? []) {
    if (!isRecord(permission)) {
      throw new TypeError("Console UI permission request must be an object");
    }
    assertExactKeys(
      permission,
      [
        "permissionId",
        "operations",
        "resources",
        "outboundDestinations",
        "secretReferences",
      ],
      "Console UI permission request"
    );
    if (
      !nonEmpty(permission.permissionId) ||
      permissionIds.has(permission.permissionId) ||
      (permission.operations !== undefined &&
        !sortedUniqueNonEmpty(permission.operations)) ||
      (permission.resources !== undefined &&
        !sortedUniqueNonEmpty(permission.resources)) ||
      (permission.outboundDestinations !== undefined &&
        !sortedUniqueNonEmpty(permission.outboundDestinations)) ||
      (permission.secretReferences !== undefined &&
        !sortedUniqueNonEmpty(permission.secretReferences))
    ) {
      throw new TypeError("Console UI permission request is invalid");
    }
    permissionIds.add(permission.permissionId);
  }
  if (
    artifact.provenance !== undefined &&
    !Array.isArray(artifact.provenance)
  ) {
    throw new TypeError("Console UI provenance must be an array");
  }
  const provenanceDigests = new Set<string>();
  for (const reference of artifact.provenance ?? []) {
    if (!isRecord(reference)) {
      throw new TypeError("Console UI provenance reference must be an object");
    }
    assertExactKeys(
      reference,
      ["locator", "digest"],
      "Console UI provenance reference"
    );
    if (
      !nonEmpty(reference.locator) ||
      !isConsoleSha256Digest(reference.digest) ||
      provenanceDigests.has(reference.digest)
    ) {
      throw new TypeError("Console UI provenance reference is invalid");
    }
    provenanceDigests.add(reference.digest);
  }
};

const parseVersion = (value: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

export const isSemverRangeCompatible = (
  range: string,
  version: string
): boolean => {
  const expected = parseVersion(version);
  if (!expected) {
    return false;
  }
  const normalized = range.trim().replace(/^v/u, "");
  const operator = normalized.slice(0, 1);
  const candidate = parseVersion(
    operator === "^" || operator === "~" ? normalized.slice(1) : normalized
  );
  if (!candidate) {
    return false;
  }
  const atLeast =
    expected[0] > candidate[0] ||
    (expected[0] === candidate[0] &&
      (expected[1] > candidate[1] ||
        (expected[1] === candidate[1] && expected[2] >= candidate[2])));
  if (operator === "^") {
    return expected[0] === candidate[0] && atLeast;
  }
  if (operator === "~") {
    return (
      expected[0] === candidate[0] && expected[1] === candidate[1] && atLeast
    );
  }
  return (
    expected[0] === candidate[0] &&
    expected[1] === candidate[1] &&
    expected[2] === candidate[2]
  );
};

export const validateFrameworkModuleRelease = (
  release: FrameworkModuleRelease
): void => {
  if (!isRecord(release)) {
    throw new TypeError("Framework Module Release is required");
  }
  if (
    release.protocol !== "lenso.module-release.v1" ||
    !nonEmpty(release.module_id) ||
    !nonEmpty(release.version) ||
    !isConsoleSha256Digest(release.manifest_digest) ||
    !isRecord(release.manifest) ||
    !isRecord(release.delivery)
  ) {
    throw new TypeError("Framework Module Release identity is invalid");
  }
  const artifact = release.console_ui_artifact;
  if (!artifact) {
    return;
  }
  validateConsoleUiEsmArtifact(artifact);
  if (artifact.manifest.moduleId !== release.module_id) {
    throw new TypeError(
      "Framework Module Release and Console artifact identities differ"
    );
  }
  if (release.compatibility !== undefined && !isRecord(release.compatibility)) {
    throw new TypeError("Framework Module Release compatibility is invalid");
  }
  const compatibility = release.compatibility ?? {};
  if (
    compatibility.host_api_requirement !== undefined &&
    compatibility.host_api_requirement !== artifact.manifest.hostApi
  ) {
    throw new TypeError(
      "Framework Module Release host API range differs from its artifact"
    );
  }
  if (
    compatibility.console_ui_requirement !== undefined &&
    compatibility.console_ui_requirement !== artifact.manifest.consoleUi
  ) {
    throw new TypeError(
      "Framework Module Release Console UI range differs from its artifact"
    );
  }
  const surfaces = release.manifest.console;
  if (
    Array.isArray(surfaces) &&
    surfaces.some(
      (surface) =>
        isRecord(surface) &&
        isRecord(surface.presentation) &&
        (surface.presentation.kind === "isolated" ||
          surface.presentation.bridge_protocol === CONSOLE_BRIDGE_PROTOCOL)
    )
  ) {
    throw new TypeError("Retired Console Bridge artifacts are not loadable");
  }
};
