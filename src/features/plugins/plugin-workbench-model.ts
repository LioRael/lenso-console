import demoPluginWorkbenchFixture from "./demo-plugin-workbench.json";

export type PluginGenerationState =
  | "active"
  | "staging"
  | "draining"
  | "standby"
  | "failed";

export type PluginWorkbenchPlugin = {
  capabilityIds: readonly string[];
  instanceKey: string;
  packageId: string;
  packageVersion: string;
  receiptDigest: string;
  state: PluginGenerationState;
};

export type PluginWorkbenchProjection = {
  generation: {
    activatedAt: string;
    generationId: string;
    planDigest: string;
    state: PluginGenerationState;
  };
  observedAt: string;
  plugins: readonly PluginWorkbenchPlugin[];
  schema: "lenso.console.plugin-workbench.v1";
  stream: {
    cursor: string;
    path: string;
  };
};

export type PluginWorkbenchEvent = {
  eventId: string;
  occurredAt: string;
  projection: PluginWorkbenchProjection;
  type: "workbench.snapshot";
};

export const demoPluginWorkbenchProjection = decodePluginWorkbenchProjection(
  demoPluginWorkbenchFixture
);

export function pluginWorkbenchProjectionFromEvent(
  value: unknown
): PluginWorkbenchProjection | undefined {
  if (!isRecord(value) || value.type !== "workbench.snapshot") {
    return undefined;
  }
  const { projection } = value;
  return isPluginWorkbenchProjection(projection) ? projection : undefined;
}

export function decodePluginWorkbenchProjection(
  value: unknown
): PluginWorkbenchProjection {
  if (!isPluginWorkbenchProjection(value)) {
    throw new Error("Plugin Workbench returned an invalid v1 projection");
  }
  return value;
}

export function shortPluginDigest(digest: string): string {
  const value = digest.startsWith("sha256:") ? digest.slice(7) : digest;
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function isPluginWorkbenchProjection(
  value: unknown
): value is PluginWorkbenchProjection {
  return (
    isRecord(value) &&
    value.schema === "lenso.console.plugin-workbench.v1" &&
    typeof value.observedAt === "string" &&
    isGeneration(value.generation) &&
    Array.isArray(value.plugins) &&
    value.plugins.every(isPlugin) &&
    isRecord(value.stream) &&
    typeof value.stream.cursor === "string" &&
    typeof value.stream.path === "string"
  );
}

function isGeneration(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.activatedAt === "string" &&
    typeof value.generationId === "string" &&
    typeof value.planDigest === "string" &&
    isGenerationState(value.state)
  );
}

function isPlugin(value: unknown): value is PluginWorkbenchPlugin {
  return (
    isRecord(value) &&
    Array.isArray(value.capabilityIds) &&
    value.capabilityIds.every((capability) => typeof capability === "string") &&
    typeof value.instanceKey === "string" &&
    typeof value.packageId === "string" &&
    typeof value.packageVersion === "string" &&
    typeof value.receiptDigest === "string" &&
    isGenerationState(value.state)
  );
}

function isGenerationState(value: unknown): value is PluginGenerationState {
  return (
    value === "active" ||
    value === "staging" ||
    value === "draining" ||
    value === "standby" ||
    value === "failed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
