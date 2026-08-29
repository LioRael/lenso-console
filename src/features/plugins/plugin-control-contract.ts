export type PluginGenerationEventStatus =
  | "preparing"
  | "rejected"
  | "rolled_back"
  | "switched"
  | "watch_degraded";

export type PluginGenerationEvent = {
  cursor: string;
  desiredStateDigest?: string;
  detail?: string;
  generationSpecDigest?: string;
  planDigest?: string;
  pluginRootRevision?: string;
  previousGenerationSpecDigest?: string;
  restoredGenerationSpecDigest?: string;
  routingEpoch?: string;
  status: PluginGenerationEventStatus;
};

export type PluginConfigurationStatus = "applied" | "pending" | "rejected";

export type PluginConfigurationAuthority = {
  kind: string;
  publicationHistory: boolean;
  reference: string;
  rollbackProposals: boolean;
};

export type PluginSelectionItem = {
  disableable: boolean;
  entrypoint: string;
  executionClass: string;
  instanceKey: string;
  packageId: string;
  packageRevision: string;
  providedCapabilities: readonly string[];
  requiredCapabilities: readonly string[];
};

export type ActivePluginSelection = {
  generationSpecDigest: string;
  planDigest: string;
  pluginRootRevision: string;
  plugins: readonly PluginSelectionItem[];
};

export type DesiredPluginSelection = {
  desiredStateDigest: string;
  planDigest: string;
  pluginRootRevision: string;
  plugins: readonly PluginSelectionItem[];
};

export type PreparingPluginSelection = DesiredPluginSelection & {
  generationSpecDigest: string;
};

export type PluginInventory = {
  active: ActivePluginSelection;
  appliedRevision: string;
  configurationAuthority: PluginConfigurationAuthority | null;
  configurationStatus: PluginConfigurationStatus;
  cursor: string;
  desired: DesiredPluginSelection;
  desiredRevision: string;
  events: readonly PluginGenerationEvent[];
  preparing: PreparingPluginSelection | null;
  schema: "lenso.agent.plugin-inventory.v2";
  truncated: boolean;
};

export type ManagedPluginInstance = {
  disableable: boolean;
  hasRootDifference: boolean;
  instanceKey: string;
  origin: "host-default" | "plugin-root";
  rootConfigurationToml: string | null;
  selection: "disabled-by-root" | "enabled" | "excluded-by-profile";
};

export type ManagedPlugin = {
  instances: readonly ManagedPluginInstance[];
  packageId: string;
  packageRevision: string;
  rootSupplied: boolean;
};

export type PluginManagement = {
  configurationAuthority: PluginConfigurationAuthority;
  plugins: readonly ManagedPlugin[];
  revision: string;
  schema: "lenso.agent.plugin-management.v1";
};

export type PluginConfigurationProposal = {
  application: "app_generation" | "blocked" | "noop";
  baseRevision: string;
  candidateRevision: string;
  configurationAuthority: PluginConfigurationAuthority;
  diagnostics: readonly { code: string; detail: string }[];
  instanceKey: string;
  pluginId: string;
  proposalDigest: string;
  schema: "lenso.plugin-configuration-proposal.v1";
  status: "needs_decision" | "ready" | "rejected";
};

export type PluginConfigurationPublicationRecord = {
  baseRevision: string;
  configurationToml: string;
  proposalDigest: string;
  publishedAtUnixMs: number;
  revision: string;
  rollbackOfProposalDigest: string | null;
};

export type PluginConfigurationHistory = {
  configurationAuthority: PluginConfigurationAuthority;
  instanceKey: string;
  pluginId: string;
  publications: readonly PluginConfigurationPublicationRecord[];
  schema: "lenso.agent.plugin-configuration-history.v1";
};

export type PluginConfigurationRollbackProposal = {
  configurationToml: string;
  proposal: PluginConfigurationProposal;
  rollbackOfProposalDigest: string;
  schema: "lenso.agent.plugin-configuration-rollback-proposal.v1";
};

export function decodePluginInventory(value: unknown): PluginInventory {
  if (!isRecord(value) || value.schema !== "lenso.agent.plugin-inventory.v2") {
    throw new TypeError(
      "Agent Host does not expose the cursor-based Plugin inventory v2 contract"
    );
  }
  if (!isActiveSelection(value.active)) {
    throw new TypeError("Agent Host returned invalid active Plugin state");
  }
  if (
    typeof value.appliedRevision !== "string" ||
    value.appliedRevision.length === 0
  ) {
    throw new TypeError(
      "Agent Host returned an invalid applied Plugin Root revision"
    );
  }
  if (value.active.pluginRootRevision !== value.appliedRevision) {
    throw new TypeError(
      "Agent Host returned inconsistent active Plugin Root revisions"
    );
  }
  if (!isOptionalConfigurationAuthority(value.configurationAuthority)) {
    throw new TypeError(
      "Agent Host returned an invalid Plugin configuration authority"
    );
  }
  if (!isConfigurationStatus(value.configurationStatus)) {
    throw new TypeError(
      "Agent Host returned invalid Plugin configuration status"
    );
  }
  if (!isCursor(value.cursor)) {
    throw new TypeError("Agent Host returned an invalid Plugin event cursor");
  }
  if (!isDesiredSelection(value.desired)) {
    throw new TypeError("Agent Host returned invalid desired Plugin state");
  }
  if (
    typeof value.desiredRevision !== "string" ||
    value.desiredRevision.length === 0
  ) {
    throw new TypeError(
      "Agent Host returned an invalid desired Plugin Root revision"
    );
  }
  if (value.desired.pluginRootRevision !== value.desiredRevision) {
    throw new TypeError(
      "Agent Host returned inconsistent desired Plugin Root revisions"
    );
  }
  if (!Array.isArray(value.events) || !value.events.every(isGenerationEvent)) {
    throw new TypeError("Agent Host returned invalid Plugin Generation events");
  }
  if (value.preparing !== null && !isPreparingSelection(value.preparing)) {
    throw new TypeError("Agent Host returned invalid preparing Plugin state");
  }
  if (typeof value.truncated !== "boolean") {
    throw new TypeError("Agent Host returned invalid Plugin event pagination");
  }
  const revisionsMatch = value.appliedRevision === value.desiredRevision;
  if (
    (value.configurationStatus === "applied") !== revisionsMatch ||
    (value.preparing !== null &&
      (value.preparing.pluginRootRevision !== value.desiredRevision ||
        value.preparing.desiredStateDigest !==
          value.desired.desiredStateDigest ||
        value.preparing.planDigest !== value.desired.planDigest)) ||
    !eventsAreOrderedThrough(value.events, value.cursor)
  ) {
    throw new TypeError(
      "Agent Host returned internally inconsistent Plugin inventory evidence"
    );
  }
  return value as PluginInventory;
}

function eventsAreOrderedThrough(
  events: readonly PluginGenerationEvent[],
  cursor: string
) {
  let previous = -1n;
  const pageCursor = BigInt(cursor);
  for (const event of events) {
    const current = BigInt(event.cursor);
    if (current <= previous || current > pageCursor) {
      return false;
    }
    previous = current;
  }
  return true;
}

export function decodeDesiredPluginSelection(
  value: unknown
): DesiredPluginSelection {
  if (!isDesiredSelection(value)) {
    throw new TypeError("Agent Host returned invalid desired Plugin state");
  }
  return value;
}

export function decodePluginManagement(value: unknown): PluginManagement {
  if (!isRecord(value) || value.schema !== "lenso.agent.plugin-management.v1") {
    throw new TypeError("Agent Host returned invalid Plugin management state");
  }
  if (!Array.isArray(value.plugins) || !value.plugins.every(isManagedPlugin)) {
    throw new TypeError("Agent Host returned invalid managed Plugin entries");
  }
  if (
    !isConfigurationAuthority(value.configurationAuthority) ||
    typeof value.revision !== "string" ||
    value.revision.length === 0
  ) {
    throw new TypeError(
      "Agent Host returned invalid Plugin management authority"
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
    (value.application !== "app_generation" &&
      value.application !== "blocked" &&
      value.application !== "noop") ||
    typeof value.baseRevision !== "string" ||
    value.baseRevision.length === 0 ||
    typeof value.candidateRevision !== "string" ||
    value.candidateRevision.length === 0 ||
    !isConfigurationAuthority(value.configurationAuthority) ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isConfigurationDiagnostic) ||
    typeof value.instanceKey !== "string" ||
    value.instanceKey.length === 0 ||
    typeof value.pluginId !== "string" ||
    value.pluginId.length === 0 ||
    typeof value.proposalDigest !== "string" ||
    value.proposalDigest.length === 0 ||
    (value.status !== "needs_decision" &&
      value.status !== "ready" &&
      value.status !== "rejected")
  ) {
    throw new TypeError(
      "Agent Host returned an invalid configuration proposal"
    );
  }
  return value as PluginConfigurationProposal;
}

export function decodePluginConfigurationHistory(
  value: unknown
): PluginConfigurationHistory {
  if (
    !isRecord(value) ||
    value.schema !== "lenso.agent.plugin-configuration-history.v1" ||
    !isConfigurationAuthority(value.configurationAuthority) ||
    typeof value.instanceKey !== "string" ||
    value.instanceKey.length === 0 ||
    typeof value.pluginId !== "string" ||
    value.pluginId.length === 0 ||
    !Array.isArray(value.publications) ||
    !value.publications.every(isPluginConfigurationPublicationRecord)
  ) {
    throw new TypeError(
      "Agent Host returned invalid Plugin configuration history"
    );
  }
  return value as PluginConfigurationHistory;
}

export function decodePluginConfigurationRollbackProposal(
  value: unknown
): PluginConfigurationRollbackProposal {
  if (
    !isRecord(value) ||
    value.schema !== "lenso.agent.plugin-configuration-rollback-proposal.v1" ||
    typeof value.configurationToml !== "string" ||
    typeof value.rollbackOfProposalDigest !== "string" ||
    value.rollbackOfProposalDigest.length === 0
  ) {
    throw new TypeError(
      "Agent Host returned an invalid Plugin configuration rollback proposal"
    );
  }
  decodePluginConfigurationProposal(value.proposal);
  return value as PluginConfigurationRollbackProposal;
}

function isActiveSelection(value: unknown): value is ActivePluginSelection {
  return (
    isRecord(value) &&
    typeof value.generationSpecDigest === "string" &&
    typeof value.planDigest === "string" &&
    typeof value.pluginRootRevision === "string" &&
    isPluginSelection(value.plugins)
  );
}

function isConfigurationStatus(
  value: unknown
): value is PluginConfigurationStatus {
  return value === "applied" || value === "pending" || value === "rejected";
}

function isCursor(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

function isDesiredSelection(value: unknown): value is DesiredPluginSelection {
  return (
    isRecord(value) &&
    typeof value.desiredStateDigest === "string" &&
    typeof value.planDigest === "string" &&
    typeof value.pluginRootRevision === "string" &&
    isPluginSelection(value.plugins)
  );
}

function isGenerationEvent(value: unknown): value is PluginGenerationEvent {
  return (
    isRecord(value) &&
    isCursor(value.cursor) &&
    optionalString(value.desiredStateDigest) &&
    optionalString(value.detail) &&
    optionalString(value.generationSpecDigest) &&
    optionalString(value.planDigest) &&
    optionalString(value.pluginRootRevision) &&
    optionalString(value.previousGenerationSpecDigest) &&
    optionalString(value.restoredGenerationSpecDigest) &&
    optionalCursor(value.routingEpoch) &&
    (value.status === "preparing" ||
      value.status === "rejected" ||
      value.status === "rolled_back" ||
      value.status === "switched" ||
      value.status === "watch_degraded")
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
    (value.selection === "enabled" ||
      value.selection === "disabled-by-root" ||
      value.selection === "excluded-by-profile")
  );
}

function isPluginSelection(value: unknown): value is PluginSelectionItem[] {
  return Array.isArray(value) && value.every(isPluginSelectionItem);
}

function isPluginSelectionItem(value: unknown): value is PluginSelectionItem {
  return (
    isRecord(value) &&
    typeof value.disableable === "boolean" &&
    typeof value.entrypoint === "string" &&
    typeof value.executionClass === "string" &&
    typeof value.instanceKey === "string" &&
    typeof value.packageId === "string" &&
    typeof value.packageRevision === "string" &&
    isStringArray(value.providedCapabilities) &&
    isStringArray(value.requiredCapabilities)
  );
}

function isPreparingSelection(
  value: unknown
): value is PreparingPluginSelection {
  return (
    isDesiredSelection(value) &&
    "generationSpecDigest" in value &&
    typeof value.generationSpecDigest === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isConfigurationAuthority(
  value: unknown
): value is PluginConfigurationAuthority {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    value.kind.length > 0 &&
    typeof value.publicationHistory === "boolean" &&
    typeof value.reference === "string" &&
    value.reference.length > 0 &&
    typeof value.rollbackProposals === "boolean"
  );
}

function isOptionalConfigurationAuthority(
  value: unknown
): value is PluginConfigurationAuthority | null {
  return value === null || isConfigurationAuthority(value);
}

function isConfigurationDiagnostic(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.detail === "string"
  );
}

function isPluginConfigurationPublicationRecord(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.baseRevision === "string" &&
    value.baseRevision.length > 0 &&
    typeof value.configurationToml === "string" &&
    typeof value.proposalDigest === "string" &&
    value.proposalDigest.length > 0 &&
    typeof value.publishedAtUnixMs === "number" &&
    Number.isSafeInteger(value.publishedAtUnixMs) &&
    value.publishedAtUnixMs >= 0 &&
    typeof value.revision === "string" &&
    value.revision.length > 0 &&
    (value.rollbackOfProposalDigest === null ||
      (typeof value.rollbackOfProposalDigest === "string" &&
        value.rollbackOfProposalDigest.length > 0))
  );
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function optionalCursor(value: unknown) {
  return value === undefined || isCursor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
