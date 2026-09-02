import type { AgentToolCall } from "../agent/agent-runtime";

const CHECK_PLUGIN_CHANGE_TOOL = "check_plugin_change";
const APPLY_PLUGIN_CHANGE_TOOL = "apply_plugin_change";
const MAX_CONFIGURATION_BYTES = 7168;

type AgentPluginAuthority = {
  kind: string;
  reference: string;
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

export type AgentPluginReceipt =
  | AgentPluginProposalReceipt
  | AgentPluginPublicationReceipt;

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
  if (tool.name === CHECK_PLUGIN_CHANGE_TOOL) {
    return decodeProposal(argumentsValue, result);
  }
  if (tool.name === APPLY_PLUGIN_CHANGE_TOOL) {
    return decodePublication(argumentsValue, result);
  }
  return null;
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

function decodeAuthority(value: unknown): AgentPluginAuthority | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.kind) ||
    !isNonEmptyString(value.reference)
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
