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

export type PluginSelectionAuthority = {
  kind: string;
  reference: string;
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
  streamId: string;
  truncated: boolean;
};

export type ManagedPluginInstance = {
  disableable: boolean;
  hasRootDifference: boolean;
  instanceKey: string;
  origin: "host-default" | "plugin-root";
  rootConfigurationToml: string | null;
  selection: "disabled-by-root" | "enabled" | "excluded-by-profile";
  sourceDigest: string;
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
  selectionAuthority: PluginSelectionAuthority | null;
};

export type PluginConfigurationProposal = {
  application: "app_generation" | "blocked" | "noop";
  baseRevision: string;
  baseSourceDigest: string;
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
  baseSourceDigest: string | null;
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

export function decodePluginInventory(
  value: unknown,
  after?: string
): PluginInventory {
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
  if (typeof value.streamId !== "string" || value.streamId.length === 0) {
    throw new TypeError("Agent Host returned an invalid Plugin event stream");
  }
  if (
    (value.configurationStatus === "applied" &&
      (value.appliedRevision !== value.desiredRevision ||
        value.active.planDigest !== value.desired.planDigest)) ||
    (value.preparing !== null &&
      (value.preparing.pluginRootRevision !== value.desiredRevision ||
        value.preparing.desiredStateDigest !==
          value.desired.desiredStateDigest ||
        value.preparing.planDigest !== value.desired.planDigest)) ||
    !eventsAreCompleteThrough(
      value.events,
      value.cursor,
      value.truncated,
      after
    )
  ) {
    throw new TypeError(
      "Agent Host returned internally inconsistent Plugin inventory evidence"
    );
  }
  return value as PluginInventory;
}

export function assertPluginInventoryPage(
  inventory: PluginInventory,
  after?: string
) {
  if (
    !eventsAreCompleteThrough(
      inventory.events,
      inventory.cursor,
      inventory.truncated,
      after
    )
  ) {
    throw new TypeError(
      "Agent Host returned an incomplete Plugin inventory event page"
    );
  }
}

function eventsAreCompleteThrough(
  events: readonly PluginGenerationEvent[],
  cursor: string,
  truncated: boolean,
  after: string | undefined
) {
  const requestedAfter = after === undefined ? 0n : BigInt(after);
  const pageCursor = BigInt(cursor);
  if (pageCursor < requestedAfter) {
    return events.length === 0 && !truncated;
  }
  if (pageCursor === requestedAfter) {
    return events.length === 0 && !truncated;
  }
  if (events.length === 0) {
    return false;
  }
  let previous: bigint | undefined;
  for (const event of events) {
    const current = BigInt(event.cursor);
    if (
      current > pageCursor ||
      (previous !== undefined && current !== previous + 1n)
    ) {
      return false;
    }
    previous = current;
  }
  const first = BigInt(events[0]?.cursor ?? "0");
  const expectedFirst = requestedAfter + 1n;
  return (
    previous === pageCursor &&
    (truncated ? first > expectedFirst : first === expectedFirst)
  );
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
  if (
    !Array.isArray(value.plugins) ||
    !value.plugins.every(isManagedPlugin) ||
    !hasUniqueValues(value.plugins, (plugin) => plugin.packageId)
  ) {
    throw new TypeError("Agent Host returned invalid managed Plugin entries");
  }
  if (
    !isConfigurationAuthority(value.configurationAuthority) ||
    (value.selectionAuthority !== undefined &&
      !isOptionalSelectionAuthority(value.selectionAuthority)) ||
    typeof value.revision !== "string" ||
    value.revision.length === 0
  ) {
    throw new TypeError(
      "Agent Host returned invalid Plugin management authority"
    );
  }
  return {
    ...value,
    selectionAuthority: value.selectionAuthority ?? null,
  } as PluginManagement;
}

function isSelectionAuthority(
  value: unknown
): value is PluginSelectionAuthority {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    value.kind.length > 0 &&
    typeof value.reference === "string" &&
    value.reference.length > 0
  );
}

function isOptionalSelectionAuthority(
  value: unknown
): value is PluginSelectionAuthority | null {
  return value === null || isSelectionAuthority(value);
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
    typeof value.baseSourceDigest !== "string" ||
    value.baseSourceDigest.length === 0 ||
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
  const readyNoop =
    value.status === "ready" &&
    value.application === "noop" &&
    value.candidateRevision === value.baseRevision &&
    value.diagnostics.length === 0;
  const readyGeneration =
    value.status === "ready" &&
    value.application === "app_generation" &&
    value.candidateRevision !== value.baseRevision &&
    value.diagnostics.length === 0;
  const blocked =
    (value.status === "needs_decision" || value.status === "rejected") &&
    value.application === "blocked" &&
    value.diagnostics.length > 0;
  if (!(readyNoop || readyGeneration || blocked)) {
    throw new TypeError(
      "Agent Host returned an internally inconsistent configuration proposal"
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
    value.generationSpecDigest.length > 0 &&
    typeof value.planDigest === "string" &&
    value.planDigest.length > 0 &&
    typeof value.pluginRootRevision === "string" &&
    value.pluginRootRevision.length > 0 &&
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
    value.desiredStateDigest.length > 0 &&
    typeof value.planDigest === "string" &&
    value.planDigest.length > 0 &&
    typeof value.pluginRootRevision === "string" &&
    value.pluginRootRevision.length > 0 &&
    isPluginSelection(value.plugins)
  );
}

function isGenerationEvent(value: unknown): value is PluginGenerationEvent {
  if (
    !isRecord(value) ||
    !isCursor(value.cursor) ||
    !optionalNonEmptyString(value.desiredStateDigest) ||
    !optionalNonEmptyString(value.detail) ||
    !optionalNonEmptyString(value.generationSpecDigest) ||
    !optionalNonEmptyString(value.planDigest) ||
    !optionalNonEmptyString(value.pluginRootRevision) ||
    !optionalNonEmptyString(value.previousGenerationSpecDigest) ||
    !optionalNonEmptyString(value.restoredGenerationSpecDigest) ||
    !optionalCursor(value.routingEpoch)
  ) {
    return false;
  }
  const hasDesiredIdentity =
    typeof value.desiredStateDigest === "string" &&
    typeof value.planDigest === "string" &&
    typeof value.pluginRootRevision === "string";
  const hasNoDesiredIdentity =
    value.desiredStateDigest === undefined &&
    value.planDigest === undefined &&
    value.pluginRootRevision === undefined;
  if (value.status === "preparing") {
    return (
      hasDesiredIdentity &&
      typeof value.generationSpecDigest === "string" &&
      typeof value.previousGenerationSpecDigest === "string"
    );
  }
  if (value.status === "switched") {
    return (
      hasDesiredIdentity &&
      typeof value.generationSpecDigest === "string" &&
      typeof value.previousGenerationSpecDigest === "string" &&
      typeof value.routingEpoch === "string"
    );
  }
  if (value.status === "rolled_back") {
    return (
      (hasDesiredIdentity || hasNoDesiredIdentity) &&
      typeof value.detail === "string" &&
      typeof value.generationSpecDigest === "string" &&
      typeof value.restoredGenerationSpecDigest === "string" &&
      typeof value.routingEpoch === "string"
    );
  }
  if (value.status === "rejected") {
    return typeof value.detail === "string";
  }
  return (
    value.status === "watch_degraded" &&
    hasNoDesiredIdentity &&
    typeof value.detail === "string"
  );
}

function isManagedPlugin(value: unknown): value is ManagedPlugin {
  return (
    isRecord(value) &&
    typeof value.packageId === "string" &&
    value.packageId.length > 0 &&
    !value.packageId.includes("/") &&
    typeof value.packageRevision === "string" &&
    value.packageRevision.length > 0 &&
    typeof value.rootSupplied === "boolean" &&
    Array.isArray(value.instances) &&
    value.instances.every(isManagedPluginInstance) &&
    hasUniqueValues(value.instances, (instance) => instance.instanceKey)
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
    value.instanceKey.length > 0 &&
    !value.instanceKey.includes("/") &&
    (value.origin === "host-default" || value.origin === "plugin-root") &&
    (value.rootConfigurationToml === null ||
      typeof value.rootConfigurationToml === "string") &&
    (value.selection === "enabled" ||
      value.selection === "disabled-by-root" ||
      value.selection === "excluded-by-profile") &&
    typeof value.sourceDigest === "string" &&
    value.sourceDigest.length > 0
  );
}

function isPluginSelection(value: unknown): value is PluginSelectionItem[] {
  return (
    Array.isArray(value) &&
    value.every(isPluginSelectionItem) &&
    hasUniqueValues(value, (item) => item.instanceKey)
  );
}

function isPluginSelectionItem(value: unknown): value is PluginSelectionItem {
  return (
    isRecord(value) &&
    typeof value.disableable === "boolean" &&
    typeof value.entrypoint === "string" &&
    value.entrypoint.length > 0 &&
    typeof value.executionClass === "string" &&
    value.executionClass.length > 0 &&
    typeof value.instanceKey === "string" &&
    typeof value.packageId === "string" &&
    value.packageId.length > 0 &&
    !value.packageId.includes("/") &&
    isCanonicalSelectionInstanceKey(value.instanceKey, value.packageId) &&
    typeof value.packageRevision === "string" &&
    value.packageRevision.length > 0 &&
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
    typeof value.generationSpecDigest === "string" &&
    value.generationSpecDigest.length > 0
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.length > 0) &&
    new Set(value).size === value.length
  );
}

function isCanonicalSelectionInstanceKey(
  instanceKey: string,
  packageId: string
) {
  const separator = instanceKey.indexOf("/");
  return (
    separator === instanceKey.lastIndexOf("/") &&
    separator === packageId.length &&
    instanceKey.startsWith(`${packageId}/`) &&
    separator < instanceKey.length - 1
  );
}

function hasUniqueValues<T>(
  values: readonly T[],
  select: (value: T) => string
) {
  const selected = values.map(select);
  return new Set(selected).size === selected.length;
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
    value.code.length > 0 &&
    typeof value.detail === "string" &&
    value.detail.length > 0
  );
}

function isPluginConfigurationPublicationRecord(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.baseRevision === "string" &&
    value.baseRevision.length > 0 &&
    (value.baseSourceDigest === null ||
      (typeof value.baseSourceDigest === "string" &&
        value.baseSourceDigest.length > 0)) &&
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

function optionalNonEmptyString(value: unknown) {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

function optionalCursor(value: unknown) {
  return value === undefined || isCursor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
