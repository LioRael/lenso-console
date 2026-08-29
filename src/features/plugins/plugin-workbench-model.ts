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

export function decodePluginInventory(value: unknown): PluginInventory {
  if (!isRecord(value) || value.schema !== "lenso.agent.plugin-inventory.v1") {
    throw new TypeError("Agent Host returned an invalid Plugin inventory");
  }
  if (!Array.isArray(value.plugins) || !value.plugins.every(isPlugin)) {
    throw new TypeError("Agent Host returned invalid Plugin entries");
  }
  return value as PluginInventory;
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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
