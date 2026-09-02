import type { AgentToolCall } from "../agent/agent-runtime";

const INSPECT_APP_TOOL = "inspect_app";
const LIST_PLUGINS_TOOL = "list_plugins";
const INSPECT_PLUGIN_TOOL = "inspect_plugin";
const CHECK_PLUGIN_CHANGE_TOOL = "check_plugin_change";
const APPLY_PLUGIN_CHANGE_TOOL = "apply_plugin_change";
const SET_PLUGIN_ENABLED_TOOL = "set_plugin_enabled";
const MAX_CONFIGURATION_BYTES = 7168;

type AgentPluginAuthority = {
  kind: string;
  reference: string;
};

type AgentPluginInspectionBase = {
  authority: AgentPluginAuthority;
  revision: string;
};

export type AgentAppInspectionReceipt = AgentPluginInspectionBase & {
  bindingCount: number;
  enabledInstanceCount: number;
  kind: "app_inspection";
  pluginCount: number;
};

export type AgentPluginListItem = {
  enabledInstanceCount: number;
  instanceCount: number;
  packageId: string;
  packageRevision: string;
  source: string;
};

export type AgentPluginListReceipt = AgentPluginInspectionBase & {
  kind: "plugin_list";
  plugins: readonly AgentPluginListItem[];
  query: string;
};

export type AgentPluginInstanceInspection = {
  disableable: boolean;
  hasRootDifference: boolean;
  instanceKey: string;
  origin: string;
  rootConfigurationBytes: number | null;
  selection: "disabled" | "enabled";
  sourceDigest: string;
};

export type AgentPluginDetailReceipt = AgentPluginInspectionBase & {
  instances: readonly AgentPluginInstanceInspection[];
  kind: "plugin_inspection";
  packageId: string;
  packageRevision: string;
  source: string;
};

type AgentPluginReceiptBase = {
  authority: AgentPluginAuthority;
  baseRevision: string;
  baseSourceDigest: string;
  instanceKey: string;
  packageId: string;
  proposalDigest: string;
};

export type AgentPluginProposalReceipt = AgentPluginReceiptBase & {
  application: "app_generation" | "blocked" | "noop";
  candidateRevision: string;
  configurationToml: string;
  diagnostics: readonly { code: string; detail: string }[];
  kind: "proposal";
  status: "needs_decision" | "ready" | "rejected";
};

export type AgentPluginPublicationReceipt = AgentPluginReceiptBase & {
  configurationToml: string;
  kind: "publication";
  revision: string;
};

export type AgentPluginSelectionReceipt = AgentPluginInspectionBase & {
  baseRevision: string;
  enabled: boolean;
  instanceKey: string;
  kind: "selection";
  packageId: string;
};

export type AgentPluginReceipt =
  | AgentAppInspectionReceipt
  | AgentPluginListReceipt
  | AgentPluginDetailReceipt
  | AgentPluginProposalReceipt
  | AgentPluginPublicationReceipt
  | AgentPluginSelectionReceipt;

export function decodeAgentPluginReceipt(
  tool: AgentToolCall
): AgentPluginReceipt | null {
  if (
    tool.status !== "completed" ||
    tool.resultTruncated ||
    !tool.argumentsJson ||
    !tool.resultContent
  ) {
    return null;
  }
  const argumentsValue = parseObject(tool.argumentsJson);
  const result = parseObject(tool.resultContent);
  if (!(argumentsValue && result)) {
    return null;
  }
  if (tool.name === INSPECT_APP_TOOL) {
    return decodeAppInspection(argumentsValue, result);
  }
  if (tool.name === LIST_PLUGINS_TOOL) {
    return decodePluginList(argumentsValue, result);
  }
  if (tool.name === INSPECT_PLUGIN_TOOL) {
    return decodePluginInspection(argumentsValue, result);
  }
  if (tool.name === CHECK_PLUGIN_CHANGE_TOOL) {
    return decodeProposal(argumentsValue, result);
  }
  if (tool.name === APPLY_PLUGIN_CHANGE_TOOL) {
    return decodePublication(argumentsValue, result);
  }
  if (tool.name === SET_PLUGIN_ENABLED_TOOL) {
    return decodeSelection(argumentsValue, result);
  }
  return null;
}

function decodeSelection(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginSelectionReceipt | null {
  const authority = decodeAuthority(result.authority);
  if (
    !authority ||
    Object.keys(argumentsValue).length !== 4 ||
    typeof argumentsValue.enabled !== "boolean" ||
    !isBoundedString(argumentsValue.expected_revision, 71, 71) ||
    !isBoundedString(argumentsValue.instance, 1, 128) ||
    !isBoundedString(argumentsValue.plugin_id, 1, 128) ||
    result.schema !== "lenso.plugin-selection-publication.v1" ||
    result.baseRevision !== argumentsValue.expected_revision ||
    result.enabled !== argumentsValue.enabled ||
    result.instance !== argumentsValue.instance ||
    result.pluginId !== argumentsValue.plugin_id ||
    result.status !== (argumentsValue.enabled ? "enabled" : "disabled") ||
    !isBoundedString(result.revision, 71, 71)
  ) {
    return null;
  }
  return {
    authority,
    baseRevision: result.baseRevision,
    enabled: result.enabled,
    instanceKey: result.instance,
    kind: "selection",
    packageId: result.pluginId,
    revision: result.revision,
  };
}

function decodeAppInspection(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentAppInspectionReceipt | null {
  const base = decodeInspectionBase(result);
  if (
    Object.keys(argumentsValue).length !== 0 ||
    !base ||
    result.schema !== "lenso.agent.console-app-inspection.v1" ||
    !isIntegerInRange(result.bindingCount, 0, 65_536) ||
    !isIntegerInRange(result.enabledInstanceCount, 0, 65_536) ||
    !isIntegerInRange(result.pluginCount, 0, 1_024)
  ) {
    return null;
  }
  return {
    ...base,
    bindingCount: result.bindingCount,
    enabledInstanceCount: result.enabledInstanceCount,
    kind: "app_inspection",
    pluginCount: result.pluginCount,
  };
}

function decodePluginList(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginListReceipt | null {
  const base = decodeInspectionBase(result);
  const query = decodeListQuery(argumentsValue);
  if (
    !base ||
    query === null ||
    result.schema !== "lenso.agent.console-plugin-list.v1" ||
    result.query !== query ||
    !Array.isArray(result.plugins) ||
    result.plugins.length > 1_024
  ) {
    return null;
  }
  const plugins: AgentPluginListItem[] = [];
  for (const value of result.plugins) {
    if (
      !isRecord(value) ||
      !isIntegerInRange(value.enabledInstanceCount, 0, 4_096) ||
      !isIntegerInRange(value.instanceCount, 0, 4_096) ||
      value.enabledInstanceCount > value.instanceCount ||
      !isBoundedString(value.packageId, 1, 128) ||
      !isBoundedString(value.packageRevision, 1, 128) ||
      !isBoundedString(value.source, 1, 32)
    ) {
      return null;
    }
    plugins.push({
      enabledInstanceCount: value.enabledInstanceCount,
      instanceCount: value.instanceCount,
      packageId: value.packageId,
      packageRevision: value.packageRevision,
      source: value.source,
    });
  }
  return { ...base, kind: "plugin_list", plugins, query };
}

function decodePluginInspection(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginDetailReceipt | null {
  const base = decodeInspectionBase(result);
  const packageId = decodeInspectPluginArguments(argumentsValue);
  if (
    !base ||
    !packageId ||
    result.schema !== "lenso.agent.console-plugin-inspection.v1" ||
    result.packageId !== packageId ||
    !isBoundedString(result.packageRevision, 1, 128) ||
    !isBoundedString(result.source, 1, 32) ||
    !Array.isArray(result.instances) ||
    result.instances.length > 4_096
  ) {
    return null;
  }
  const instances: AgentPluginInstanceInspection[] = [];
  for (const value of result.instances) {
    if (
      !isRecord(value) ||
      typeof value.disableable !== "boolean" ||
      typeof value.hasRootDifference !== "boolean" ||
      !isBoundedString(value.instanceKey, 1, 128) ||
      !isBoundedString(value.origin, 1, 32) ||
      !isNullableIntegerInRange(value.rootConfigurationBytes, 0, 262_144) ||
      (value.selection !== "enabled" && value.selection !== "disabled") ||
      !isBoundedString(value.sourceDigest, 71, 71)
    ) {
      return null;
    }
    instances.push({
      disableable: value.disableable,
      hasRootDifference: value.hasRootDifference,
      instanceKey: value.instanceKey,
      origin: value.origin,
      rootConfigurationBytes: value.rootConfigurationBytes,
      selection: value.selection,
      sourceDigest: value.sourceDigest,
    });
  }
  return {
    ...base,
    instances,
    kind: "plugin_inspection",
    packageId,
    packageRevision: result.packageRevision,
    source: result.source,
  };
}

function decodeProposal(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginProposalReceipt | null {
  const input = decodeInput(argumentsValue);
  const authority = decodeAuthority(result.authority);
  const diagnostics = decodeDiagnostics(result.diagnostics);
  const application = enumValue(result.application, [
    "app_generation",
    "blocked",
    "noop",
  ] as const);
  const status = enumValue(result.status, [
    "needs_decision",
    "ready",
    "rejected",
  ] as const);
  if (
    !input ||
    !authority ||
    !diagnostics ||
    !application ||
    !status ||
    result.schema !== "lenso.plugin-configuration-proposal.v1" ||
    result.pluginId !== input.packageId ||
    result.instance !== input.instanceKey ||
    result.baseRevision !== input.expectedRevision ||
    !isNonEmptyString(result.baseSourceDigest) ||
    !isNonEmptyString(result.candidateRevision) ||
    !isNonEmptyString(result.proposalDigest)
  ) {
    return null;
  }
  const ready =
    status === "ready" &&
    diagnostics.length === 0 &&
    ((application === "noop" &&
      result.candidateRevision === result.baseRevision) ||
      (application === "app_generation" &&
        result.candidateRevision !== result.baseRevision));
  const blocked =
    (status === "needs_decision" || status === "rejected") &&
    application === "blocked" &&
    diagnostics.length > 0;
  if (!(ready || blocked)) {
    return null;
  }
  return {
    application,
    authority,
    baseRevision: result.baseRevision,
    baseSourceDigest: result.baseSourceDigest,
    candidateRevision: result.candidateRevision,
    configurationToml: input.configurationToml,
    diagnostics,
    instanceKey: input.instanceKey,
    kind: "proposal",
    packageId: input.packageId,
    proposalDigest: result.proposalDigest,
    status,
  };
}

function decodePublication(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginPublicationReceipt | null {
  const input = decodeInput(argumentsValue);
  const authority = decodeAuthority(result.authority);
  if (
    !input ||
    !authority ||
    !isNonEmptyString(argumentsValue.proposal_digest) ||
    result.schema !== "lenso.plugin-configuration-publication.v1" ||
    result.status !== "published_desired_state" ||
    result.baseRevision !== input.expectedRevision ||
    result.proposalDigest !== argumentsValue.proposal_digest ||
    !isNonEmptyString(result.baseSourceDigest) ||
    !isNonEmptyString(result.revision)
  ) {
    return null;
  }
  return {
    authority,
    baseRevision: result.baseRevision,
    baseSourceDigest: result.baseSourceDigest,
    configurationToml: input.configurationToml,
    instanceKey: input.instanceKey,
    kind: "publication",
    packageId: input.packageId,
    proposalDigest: result.proposalDigest,
    revision: result.revision,
  };
}

function decodeInput(value: Record<string, unknown>) {
  if (
    !isNonEmptyString(value.configuration_toml) ||
    new TextEncoder().encode(value.configuration_toml).byteLength >
      MAX_CONFIGURATION_BYTES ||
    !isNonEmptyString(value.expected_revision) ||
    !isNonEmptyString(value.instance) ||
    !isNonEmptyString(value.plugin_id)
  ) {
    return null;
  }
  return {
    configurationToml: value.configuration_toml,
    expectedRevision: value.expected_revision,
    instanceKey: value.instance,
    packageId: value.plugin_id,
  };
}

function decodeInspectionBase(
  value: Record<string, unknown>
): AgentPluginInspectionBase | null {
  const authority = decodeAuthority(value.authority);
  return authority && isBoundedString(value.revision, 71, 71)
    ? { authority, revision: value.revision }
    : null;
}

function decodeListQuery(value: Record<string, unknown>) {
  if (Object.keys(value).some((key) => key !== "query")) {
    return null;
  }
  if (value.query === undefined || value.query === null) {
    return "";
  }
  return typeof value.query === "string" && value.query.length <= 256
    ? value.query
    : null;
}

function decodeInspectPluginArguments(value: Record<string, unknown>) {
  return Object.keys(value).length === 1 &&
    isBoundedString(value.plugin_id, 1, 128)
    ? value.plugin_id
    : null;
}

function decodeAuthority(value: unknown): AgentPluginAuthority | null {
  if (
    !isRecord(value) ||
    !isBoundedString(value.kind, 1, 64) ||
    !isBoundedString(value.reference, 1, 256)
  ) {
    return null;
  }
  return { kind: value.kind, reference: value.reference };
}

function decodeDiagnostics(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }
  const diagnostics: { code: string; detail: string }[] = [];
  for (const diagnostic of value) {
    if (
      !isRecord(diagnostic) ||
      !isNonEmptyString(diagnostic.code) ||
      !isNonEmptyString(diagnostic.detail)
    ) {
      return null;
    }
    diagnostics.push({ code: diagnostic.code, detail: diagnostic.detail });
  }
  return diagnostics;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function parseObject(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isNullableIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number
): value is number | null {
  return value === null || isIntegerInRange(value, minimum, maximum);
}
