export type PluginInventoryItem = {
  entrypoint: string;
  executionClass: string;
  instanceKey: string;
  packageId: string;
  packageRevision: string;
  providedCapabilities: readonly string[];
  requiredCapabilities: readonly string[];
};

export type PluginConfigurationAuthority = {
  kind: string;
  reference: string;
};

export type PluginInventory = {
  appliedRevision: string | null;
  configurationAuthority: PluginConfigurationAuthority | null;
  configurationStatus: "applied" | "pending" | "rejected" | "unavailable";
  desiredRevision: string | null;
  plugins: readonly PluginInventoryItem[];
  schema: "lenso.agent.plugin-inventory.v1";
};

export type ManagedPluginInstance = {
  disableable: boolean;
  hasRootDifference: boolean;
  instanceKey: string;
  origin: "host-default" | "plugin-root";
  rootConfigurationToml: string | null;
  selection: "enabled" | "disabled-by-root";
};

export type ManagedPlugin = {
  instances: readonly ManagedPluginInstance[];
  packageId: string;
  packageRevision: string;
  rootSupplied: boolean;
};

export type PluginManagement = {
  configurationAuthority: PluginConfigurationAuthority | null;
  plugins: readonly ManagedPlugin[];
  revision: string;
  schema: "lenso.agent.plugin-management.v1";
};

export type PluginConfigurationProposal = {
  application: "app_generation" | "blocked" | "noop";
  baseRevision: string;
  candidateRevision: string;
  configurationAuthority: PluginConfigurationAuthority | null;
  diagnostics: readonly { code: string; detail: string }[];
  instanceKey: string;
  pluginId: string;
  proposalDigest: string;
  schema: "lenso.plugin-configuration-proposal.v1";
  status: "needs_decision" | "ready" | "rejected";
};

export type PluginConfigurationPublication = {
  baseRevision: string;
  configurationAuthority: PluginConfigurationAuthority | null;
  desired: PluginInventory;
  proposalDigest: string;
  revision: string;
  schema: "lenso.plugin-configuration-publication.v1";
  status: "published";
};

export type PluginWorkbenchItem = ManagedPluginInstance & {
  active: PluginInventoryItem | null;
  packageId: string;
  packageRevision: string;
  rootSupplied: boolean;
};

export const demoPluginInventory: PluginInventory = {
  appliedRevision:
    "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  configurationAuthority: {
    kind: "local_plugin_root",
    reference: "app",
  },
  configurationStatus: "applied",
  desiredRevision:
    "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  plugins: [
    {
      entrypoint: "default",
      executionClass: "lenso.native-rust@1",
      instanceKey: "lenso.agent.loop/agent",
      packageId: "lenso.agent.loop",
      packageRevision: "linked",
      providedCapabilities: ["lenso.agent@1"],
      requiredCapabilities: ["lenso.agent.model@1", "lenso.agent.session@1"],
    },
  ],
  schema: "lenso.agent.plugin-inventory.v1",
};

export const demoPluginManagement: PluginManagement = {
  configurationAuthority: {
    kind: "local_plugin_root",
    reference: "app",
  },
  plugins: [
    {
      instances: [
        {
          disableable: false,
          hasRootDifference: false,
          instanceKey: "agent",
          origin: "host-default",
          rootConfigurationToml: null,
          selection: "enabled",
        },
      ],
      packageId: "lenso.agent.loop",
      packageRevision: "linked",
      rootSupplied: false,
    },
  ],
  revision:
    "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  schema: "lenso.agent.plugin-management.v1",
};

export function decodePluginInventory(value: unknown): PluginInventory {
  if (!isRecord(value) || value.schema !== "lenso.agent.plugin-inventory.v1") {
    throw new TypeError("Agent Host returned an invalid Plugin inventory");
  }
  if (!Array.isArray(value.plugins) || !value.plugins.every(isPlugin)) {
    throw new TypeError("Agent Host returned invalid Plugin entries");
  }
  if (
    !isOptionalRevision(value.appliedRevision) ||
    !isOptionalConfigurationAuthority(value.configurationAuthority) ||
    !isOptionalRevision(value.desiredRevision) ||
    !isConfigurationStatus(value.configurationStatus)
  ) {
    throw new TypeError(
      "Agent Host returned invalid Plugin configuration state"
    );
  }
  return value as PluginInventory;
}

export function decodePluginManagement(value: unknown): PluginManagement {
  if (!isRecord(value) || value.schema !== "lenso.agent.plugin-management.v1") {
    throw new TypeError("Agent Host returned invalid Plugin management state");
  }
  if (!Array.isArray(value.plugins) || !value.plugins.every(isManagedPlugin)) {
    throw new TypeError("Agent Host returned invalid managed Plugin entries");
  }
  if (!isRevision(value.revision)) {
    throw new TypeError("Agent Host returned an invalid Plugin Root revision");
  }
  if (!isOptionalConfigurationAuthority(value.configurationAuthority)) {
    throw new TypeError(
      "Agent Host returned an invalid Plugin configuration authority"
    );
  }
  return value as PluginManagement;
}

export function decodePluginConfigurationProposal(
  value: unknown
): PluginConfigurationProposal {
  if (
    !isRecord(value) ||
    value.schema !== "lenso.plugin-configuration-proposal.v1" ||
    !isRevision(value.baseRevision) ||
    !isRevision(value.candidateRevision) ||
    !isOptionalConfigurationAuthority(value.configurationAuthority) ||
    !isRevision(value.proposalDigest) ||
    (value.status !== "ready" &&
      value.status !== "needs_decision" &&
      value.status !== "rejected") ||
    (value.application !== "noop" &&
      value.application !== "app_generation" &&
      value.application !== "blocked") ||
    typeof value.pluginId !== "string" ||
    typeof value.instanceKey !== "string" ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isDiagnostic)
  ) {
    throw new TypeError(
      "Agent Host returned an invalid configuration proposal"
    );
  }
  return value as PluginConfigurationProposal;
}

export function decodePluginConfigurationPublication(
  value: unknown
): PluginConfigurationPublication {
  if (
    !isRecord(value) ||
    value.schema !== "lenso.plugin-configuration-publication.v1" ||
    value.status !== "published" ||
    !isRevision(value.baseRevision) ||
    !isOptionalConfigurationAuthority(value.configurationAuthority) ||
    !isRevision(value.revision) ||
    !isRevision(value.proposalDigest)
  ) {
    throw new TypeError(
      "Agent Host returned an invalid configuration publication"
    );
  }
  decodePluginInventory(value.desired);
  return value as PluginConfigurationPublication;
}

export function pluginWorkbenchItems(
  inventory: PluginInventory,
  management: PluginManagement
): readonly PluginWorkbenchItem[] {
  const active = new Map(
    inventory.plugins.map((plugin) => [plugin.instanceKey, plugin])
  );
  return management.plugins.flatMap((plugin) =>
    plugin.instances.map((instance) => ({
      ...instance,
      active: active.get(`${plugin.packageId}/${instance.instanceKey}`) ?? null,
      packageId: plugin.packageId,
      packageRevision: plugin.packageRevision,
      rootSupplied: plugin.rootSupplied,
    }))
  );
}

function isPlugin(value: unknown): value is PluginInventoryItem {
  return (
    isRecord(value) &&
    typeof value.entrypoint === "string" &&
    typeof value.executionClass === "string" &&
    typeof value.instanceKey === "string" &&
    typeof value.packageId === "string" &&
    typeof value.packageRevision === "string" &&
    isStringArray(value.providedCapabilities) &&
    isStringArray(value.requiredCapabilities)
  );
}

function isManagedPlugin(value: unknown): value is ManagedPlugin {
  return (
    isRecord(value) &&
    typeof value.packageId === "string" &&
    typeof value.packageRevision === "string" &&
    typeof value.rootSupplied === "boolean" &&
    Array.isArray(value.instances) &&
    value.instances.every(isManagedPluginInstance)
  );
}

function isManagedPluginInstance(
  value: unknown
): value is ManagedPluginInstance {
  return (
    isRecord(value) &&
    typeof value.disableable === "boolean" &&
    typeof value.hasRootDifference === "boolean" &&
    typeof value.instanceKey === "string" &&
    (value.origin === "host-default" || value.origin === "plugin-root") &&
    (value.rootConfigurationToml === null ||
      typeof value.rootConfigurationToml === "string") &&
    (value.selection === "enabled" || value.selection === "disabled-by-root")
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isConfigurationStatus(
  value: unknown
): value is PluginInventory["configurationStatus"] {
  return (
    value === "applied" ||
    value === "pending" ||
    value === "rejected" ||
    value === "unavailable"
  );
}

function isConfigurationAuthority(
  value: unknown
): value is PluginConfigurationAuthority {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    value.kind.length > 0 &&
    typeof value.reference === "string" &&
    value.reference.length > 0
  );
}

function isOptionalConfigurationAuthority(
  value: unknown
): value is PluginConfigurationAuthority | null {
  return value === null || isConfigurationAuthority(value);
}

function isDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.detail === "string"
  );
}

function isOptionalRevision(value: unknown): value is string | null {
  return value === null || isRevision(value);
}

function isRevision(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
