export type PluginInventoryItem = {
  entrypoint: string;
  executionClass: string;
  instanceKey: string;
  packageId: string;
  packageRevision: string;
  providedCapabilities: readonly string[];
  requiredCapabilities: readonly string[];
};

export type PluginInventory = {
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
  plugins: readonly ManagedPlugin[];
  schema: "lenso.agent.plugin-management.v1";
};

export type PluginWorkbenchItem = ManagedPluginInstance & {
  active: PluginInventoryItem | null;
  packageId: string;
  packageRevision: string;
  rootSupplied: boolean;
};

export const demoPluginInventory: PluginInventory = {
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
  schema: "lenso.agent.plugin-management.v1",
};

export function decodePluginInventory(value: unknown): PluginInventory {
  if (!isRecord(value) || value.schema !== "lenso.agent.plugin-inventory.v1") {
    throw new TypeError("Agent Host returned an invalid Plugin inventory");
  }
  if (!Array.isArray(value.plugins) || !value.plugins.every(isPlugin)) {
    throw new TypeError("Agent Host returned invalid Plugin entries");
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
  return value as PluginManagement;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
