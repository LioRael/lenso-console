import type { AgentToolCall } from "../agent/agent-runtime";

const INSPECT_APP_TOOL = "inspect_app";
const LIST_PLUGINS_TOOL = "list_plugins";
const INSPECT_PLUGIN_TOOL = "inspect_plugin";
const CHECK_PLUGIN_CHANGE_TOOL = "check_plugin_change";
const APPLY_PLUGIN_CHANGE_TOOL = "apply_plugin_change";
const LIST_PLUGIN_CHANGES_TOOL = "list_plugin_changes";
const CHECK_PLUGIN_ROLLBACK_TOOL = "check_plugin_rollback";
const APPLY_PLUGIN_ROLLBACK_TOOL = "apply_plugin_rollback";
const SET_PLUGIN_ENABLED_TOOL = "set_plugin_enabled";
const MAX_CONFIGURATION_BYTES = 7168;

type AgentPluginAuthority = {
  kind: string;
  reference: string;
};

type AgentPluginInspectionBase = {
  agentId: string;
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
  agentId: string;
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

export type AgentPluginHistoryItem = {
  baseRevision: string;
  baseSourceDigest: string | null;
  proposalDigest: string;
  publishedAtUnixMs: number;
  revision: string;
  rollbackOfProposalDigest: string | null;
};

export type AgentPluginHistoryReceipt = AgentPluginInspectionBase & {
  instanceKey: string;
  kind: "history";
  packageId: string;
  publications: readonly AgentPluginHistoryItem[];
};

export type AgentPluginRollbackProposalReceipt = AgentPluginReceiptBase & {
  application: "app_generation" | "blocked" | "noop";
  candidateRevision: string;
  diagnostics: readonly { code: string; detail: string }[];
  kind: "rollback_proposal";
  rollbackOfProposalDigest: string;
  status: "needs_decision" | "ready" | "rejected";
};

export type AgentPluginRollbackPublicationReceipt = AgentPluginReceiptBase & {
  kind: "rollback_publication";
  revision: string;
  rollbackOfProposalDigest: string;
};

export type AgentPluginReceipt =
  | AgentAppInspectionReceipt
  | AgentPluginListReceipt
  | AgentPluginDetailReceipt
  | AgentPluginProposalReceipt
  | AgentPluginPublicationReceipt
  | AgentPluginSelectionReceipt
  | AgentPluginHistoryReceipt
  | AgentPluginRollbackProposalReceipt
  | AgentPluginRollbackPublicationReceipt;

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
  if (tool.name === LIST_PLUGIN_CHANGES_TOOL) {
    return decodeHistory(argumentsValue, result);
  }
  if (tool.name === CHECK_PLUGIN_ROLLBACK_TOOL) {
    return decodeRollbackProposal(argumentsValue, result);
  }
  if (tool.name === APPLY_PLUGIN_ROLLBACK_TOOL) {
    return decodeRollbackPublication(argumentsValue, result);
  }
  if (tool.name === SET_PLUGIN_ENABLED_TOOL) {
    return decodeSelection(argumentsValue, result);
  }
  return null;
}

function decodeHistory(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginHistoryReceipt | null {
  const agentId = decodeTargetAgent(argumentsValue, result);
  const authority = decodeAuthority(result.authority);
  if (
    !agentId ||
    !authority ||
    !hasOnlyOptionalLimitKeys(argumentsValue) ||
    !isBoundedString(argumentsValue.instance, 1, 128) ||
    !isBoundedString(argumentsValue.plugin_id, 1, 128) ||
    (argumentsValue.limit !== undefined &&
      !isIntegerInRange(argumentsValue.limit, 1, 50)) ||
    result.schema !== "lenso.agent.console-plugin-history.v1" ||
    result.instance !== argumentsValue.instance ||
    result.pluginId !== argumentsValue.plugin_id ||
    !isBoundedString(result.revision, 71, 71) ||
    !Array.isArray(result.publications) ||
    result.publications.length > (argumentsValue.limit ?? 10)
  ) {
    return null;
  }
  const publications: AgentPluginHistoryItem[] = [];
  for (const publication of result.publications) {
    if (
      !isRecord(publication) ||
      !hasOnlyKeys(publication, [
        "baseRevision",
        "baseSourceDigest",
        "proposalDigest",
        "publishedAtUnixMs",
        "revision",
        "rollbackOfProposalDigest",
      ]) ||
      !isBoundedString(publication.baseRevision, 71, 71) ||
      !isNullableDigest(publication.baseSourceDigest) ||
      !isBoundedString(publication.proposalDigest, 71, 71) ||
      !isIntegerInRange(
        publication.publishedAtUnixMs,
        0,
        Number.MAX_SAFE_INTEGER
      ) ||
      !isBoundedString(publication.revision, 71, 71) ||
      !isNullableDigest(publication.rollbackOfProposalDigest)
    ) {
      return null;
    }
    publications.push({
      baseRevision: publication.baseRevision,
      baseSourceDigest: publication.baseSourceDigest,
      proposalDigest: publication.proposalDigest,
      publishedAtUnixMs: publication.publishedAtUnixMs,
      revision: publication.revision,
      rollbackOfProposalDigest: publication.rollbackOfProposalDigest,
    });
  }
  return {
    agentId,
    authority,
    instanceKey: argumentsValue.instance,
    kind: "history",
    packageId: argumentsValue.plugin_id,
    publications,
    revision: result.revision,
  };
}

function decodeRollbackProposal(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginRollbackProposalReceipt | null {
  const input = decodeRollbackInput(argumentsValue, false);
  const agentId = decodeTargetAgent(argumentsValue, result);
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
    !agentId ||
    !authority ||
    !diagnostics ||
    !application ||
    !status ||
    result.schema !== "lenso.plugin-configuration-proposal.v1" ||
    result.pluginId !== input.packageId ||
    result.instance !== input.instanceKey ||
    result.baseRevision !== input.expectedRevision ||
    result.rollbackOfProposalDigest !== input.publicationProposalDigest ||
    !isBoundedString(result.baseSourceDigest, 71, 71) ||
    !isBoundedString(result.candidateRevision, 71, 71) ||
    !isBoundedString(result.proposalDigest, 71, 71)
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
  return ready || blocked
    ? {
        agentId,
        application,
        authority,
        baseRevision: result.baseRevision,
        baseSourceDigest: result.baseSourceDigest,
        candidateRevision: result.candidateRevision,
        diagnostics,
        instanceKey: input.instanceKey,
        kind: "rollback_proposal",
        packageId: input.packageId,
        proposalDigest: result.proposalDigest,
        rollbackOfProposalDigest: input.publicationProposalDigest,
        status,
      }
    : null;
}

function decodeRollbackPublication(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginRollbackPublicationReceipt | null {
  const input = decodeRollbackInput(argumentsValue, true);
  const agentId = decodeTargetAgent(argumentsValue, result);
  const authority = decodeAuthority(result.authority);
  if (
    !input ||
    !agentId ||
    !authority ||
    !input.proposalDigest ||
    result.schema !== "lenso.plugin-configuration-publication.v1" ||
    result.status !== "published_desired_state" ||
    result.baseRevision !== input.expectedRevision ||
    result.proposalDigest !== input.proposalDigest ||
    result.rollbackOfProposalDigest !== input.publicationProposalDigest ||
    !isBoundedString(result.baseSourceDigest, 71, 71) ||
    !isBoundedString(result.revision, 71, 71)
  ) {
    return null;
  }
  return {
    agentId,
    authority,
    baseRevision: result.baseRevision,
    baseSourceDigest: result.baseSourceDigest,
    instanceKey: input.instanceKey,
    kind: "rollback_publication",
    packageId: input.packageId,
    proposalDigest: input.proposalDigest,
    revision: result.revision,
    rollbackOfProposalDigest: input.publicationProposalDigest,
  };
}

function decodeSelection(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentPluginSelectionReceipt | null {
  const authority = decodeAuthority(result.authority);
  const agentId = decodeTargetAgent(argumentsValue, result);
  if (
    !authority ||
    !agentId ||
    !hasOnlyKeys(argumentsValue, [
      "agent_id",
      "enabled",
      "expected_revision",
      "instance",
      "plugin_id",
    ]) ||
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
    agentId,
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
    !decodeTargetAgent(argumentsValue, result) ||
    !hasOnlyKeys(argumentsValue, ["agent_id"]) ||
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
    !decodeTargetAgent(argumentsValue, result) ||
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
    !decodeTargetAgent(argumentsValue, result) ||
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
  const agentId = decodeTargetAgent(argumentsValue, result);
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
    !agentId ||
    !hasOnlyKeys(argumentsValue, [
      "agent_id",
      "configuration_toml",
      "expected_revision",
      "instance",
      "plugin_id",
    ]) ||
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
    agentId,
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
  const agentId = decodeTargetAgent(argumentsValue, result);
  const authority = decodeAuthority(result.authority);
  if (
    !input ||
    !agentId ||
    !hasOnlyKeys(argumentsValue, [
      "agent_id",
      "configuration_toml",
      "expected_revision",
      "instance",
      "plugin_id",
      "proposal_digest",
    ]) ||
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
    agentId,
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

function decodeRollbackInput(
  value: Record<string, unknown>,
  publication: boolean
) {
  const expectedKeys = [
    "agent_id",
    "expected_revision",
    "instance",
    "plugin_id",
    "publication_proposal_digest",
    ...(publication ? ["proposal_digest"] : []),
  ];
  if (
    !hasOnlyKeys(value, expectedKeys) ||
    !isBoundedString(value.expected_revision, 71, 71) ||
    !isBoundedString(value.instance, 1, 128) ||
    !isBoundedString(value.plugin_id, 1, 128) ||
    !isBoundedString(value.publication_proposal_digest, 71, 71) ||
    (publication && !isBoundedString(value.proposal_digest, 71, 71))
  ) {
    return null;
  }
  return {
    expectedRevision: value.expected_revision,
    instanceKey: value.instance,
    packageId: value.plugin_id,
    proposalDigest: publication ? (value.proposal_digest as string) : null,
    publicationProposalDigest: value.publication_proposal_digest,
  };
}

function decodeInspectionBase(
  value: Record<string, unknown>
): AgentPluginInspectionBase | null {
  const authority = decodeAuthority(value.authority);
  return authority &&
    isBoundedString(value.agentId, 1, 128) &&
    isBoundedString(value.revision, 71, 71)
    ? { agentId: value.agentId, authority, revision: value.revision }
    : null;
}

function decodeListQuery(value: Record<string, unknown>) {
  if (Object.keys(value).some((key) => key !== "agent_id" && key !== "query")) {
    return null;
  }
  if (value.query === undefined || value.query === null) {
    return "";
  }
  return typeof value.query === "string" && value.query.length <= 256
    ? value.query
    : null;
}

function hasOnlyOptionalLimitKeys(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  return (
    keys.length >= 3 &&
    keys.length <= 4 &&
    keys.every((key) =>
      ["agent_id", "instance", "limit", "plugin_id"].includes(key)
    ) &&
    ["agent_id", "instance", "plugin_id"].every((key) => keys.includes(key))
  );
}

function decodeInspectPluginArguments(value: Record<string, unknown>) {
  return hasOnlyKeys(value, ["agent_id", "plugin_id"]) &&
    isBoundedString(value.plugin_id, 1, 128)
    ? value.plugin_id
    : null;
}

function decodeTargetAgent(
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
) {
  return isBoundedString(argumentsValue.agent_id, 1, 128) &&
    result.agentId === argumentsValue.agent_id
    ? argumentsValue.agent_id
    : null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
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

function isNullableDigest(value: unknown): value is string | null {
  return value === null || isBoundedString(value, 71, 71);
}
