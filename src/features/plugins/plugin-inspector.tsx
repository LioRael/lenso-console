import { Button } from "@lenso/ui/button";
import { PageHeader } from "@lenso/ui/page-header";
import { SegmentedControl } from "@lenso/ui/segmented-control";
import { Switch } from "@lenso/ui/switch";
import * as stylex from "@stylexjs/stylex";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import { PluginAgentAction } from "./plugin-agent-handoff";
import type { PluginConfigurationDraftStore } from "./plugin-configuration-draft";
import { PluginConfigurationFields } from "./plugin-configuration-fields";
import {
  configurationProposalReadyPresentation,
  configurationChangeCanSubmit,
  configurationPublicationIsCurrent,
  desiredSelectionChecked,
  mutationTargetsPlugin,
  operationMatchesInventory,
  pluginConfigurationStatusLabel,
  pluginOriginLabel,
  pluginStatusPresentation,
  pluginTechnicalSelection,
  rollbackProposalReadyPresentation,
} from "./plugin-runtime-state";
import { PluginStatus } from "./plugin-status";
import { RemovePluginDialog } from "./plugin-workbench-dialogs";
import {
  pluginKey,
  type PluginConfigurationAuthority,
  type PluginConfigurationRollbackProposal,
  type PluginInventory,
  type PluginManagement,
  type PluginWorkbenchItem,
} from "./plugin-workbench-model";
import {
  pluginHistoryQueryEnabled,
  usePluginConfigurationDraft,
  usePluginConfigurationHistory,
  usePluginConfigurationProposal,
  usePluginConfigurationRollbackProposal,
  type usePluginMutation,
} from "./use-plugin-workbench";

const publicationTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const styles = stylex.create({
  capabilities: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.space2,
  },
  capability: {
    backgroundColor: tokens.colorSurfaceSubtle,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.colorContentSecondary,
    display: "inline-flex",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    lineHeight: "16px",
    paddingBlock: 5,
    paddingInline: tokens.space3,
  },
  controlCopy: { display: "grid", gap: 2, minWidth: 0 },
  controlDescription: {
    color: tokens.colorContentTertiary,
    fontSize: 12,
    lineHeight: "18px",
    maxWidth: 600,
  },
  controlRow: {
    alignItems: "center",
    display: "grid",
    gap: tokens.space4,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: 32,
  },
  controlSwitchSlot: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    width: 30,
  },
  controlTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 13,
    fontWeight: 500,
  },
  detailRoot: {
    minWidth: 0,
  },
  configurationLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 760px) minmax(240px, 300px)",
    justifyContent: "space-between",
    width: "100%",
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  configurationMain: {
    minWidth: 0,
  },
  configurationHeading: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space4,
    justifyContent: "space-between",
    minHeight: 30,
  },
  editor: {
    backgroundColor: tokens.colorSurfaceSubtle,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    color: tokens.colorContentPrimary,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    lineHeight: "17px",
    minHeight: 200,
    outline: {
      default: "none",
      ":focus": `2px solid ${tokens.colorFocusRing}`,
    },
    outlineOffset: -1,
    padding: 12,
    resize: "vertical",
    width: "100%",
    "@media (max-width: 720px)": {
      fontSize: 16,
      lineHeight: "22px",
    },
  },
  editorActions: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space2,
    justifyContent: "flex-end",
  },
  feedback: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
    margin: 0,
  },
  feedbackError: { color: "var(--color-status-error-content)" },
  field: {
    display: "grid",
    gap: tokens.space3,
    gridTemplateColumns: "112px minmax(0, 1fr)",
    "@media (max-width: 420px)": {
      gap: 2,
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  fields: { display: "grid", gap: tokens.space2, margin: 0 },
  hiddenAction: { visibility: "hidden" },
  historyAction: { justifySelf: "start" },
  historyIdentity: { display: "grid", gap: 2, minWidth: 0 },
  historyDescription: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
    margin: 0,
  },
  historyHeader: {
    display: "grid",
    gap: 2,
    paddingBlockEnd: tokens.space3,
  },
  historyList: { display: "grid" },
  historyMeta: {
    color: tokens.colorContentTertiary,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 10,
    lineHeight: "14px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historySection: {
    borderLeftColor: tokens.colorBorderTertiary,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    display: "grid",
    alignContent: "start",
    minWidth: 0,
    paddingBlock: tokens.space3,
    paddingInline: tokens.space6,
    "@media (max-width: 1100px)": {
      borderLeftWidth: 0,
      borderTopColor: tokens.colorBorderTertiary,
      borderTopStyle: "solid",
      borderTopWidth: 1,
    },
  },
  historyRow: {
    alignItems: "center",
    borderTopColor: tokens.colorBorderTertiary,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    gap: tokens.space2,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: 48,
    paddingBlock: tokens.space2,
  },
  historyTitle: {
    color: tokens.colorContentSecondary,
    fontSize: 11,
    lineHeight: "16px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailHeader: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space4,
    justifyContent: "space-between",
    minHeight: 56,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space6,
    "@media (max-width: 540px)": {
      alignItems: "start",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  detailIdentity: { display: "grid", gap: 2, minWidth: 0 },
  detailActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: tokens.space2,
    "@media (max-width: 540px)": {
      justifyContent: "flex-end",
    },
  },
  detailTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 15,
    fontWeight: 500,
    letterSpacing: "-0.005em",
    lineHeight: "20px",
    margin: 0,
    overflowWrap: "anywhere",
  },
  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  secondary: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  section: {
    display: "grid",
    gap: tokens.space2,
    gridTemplateColumns: "minmax(0, 1fr)",
    minWidth: 0,
    paddingBlock: tokens.space3,
    paddingInline: tokens.space6,
  },
  sectionTitle: {
    color: tokens.colorContentSecondary,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "18px",
    margin: 0,
  },
  term: { color: tokens.colorContentTertiary, fontSize: 11 },
  tabPanel: {
    minHeight: 320,
    outline: "none",
  },
  tabPanelFocused: {
    maxWidth: 760,
    width: "100%",
  },
  value: {
    color: tokens.colorContentSecondary,
    fontSize: 12,
    margin: 0,
    overflowWrap: "anywhere",
  },
});

export function PluginDetail({
  agentId,
  authoringEnabled,
  configurationDraftStore,
  inventory,
  management: pluginManagement,
  mutation,
  plugin,
}: {
  agentId: string;
  authoringEnabled: boolean;
  configurationDraftStore: PluginConfigurationDraftStore;
  inventory: PluginInventory;
  management: PluginManagement;
  mutation: ReturnType<typeof usePluginMutation>;
  plugin: PluginWorkbenchItem;
}) {
  const proposal = usePluginConfigurationProposal(agentId, inventory.streamId);
  const rollback = usePluginConfigurationRollbackProposal(
    agentId,
    inventory.streamId
  );
  const previousStreamId = useRef(inventory.streamId);
  const resetProposal = proposal.reset;
  const resetRollback = rollback.reset;
  useEffect(() => {
    if (previousStreamId.current === inventory.streamId) {
      return;
    }
    previousStreamId.current = inventory.streamId;
    resetProposal();
    resetRollback();
  }, [inventory.streamId, resetProposal, resetRollback]);
  const { management } = plugin;
  const restoreWasVisible = useRef(
    management?.hasRootDifference ?? false
  ).current;
  const isMutationTarget = mutationTargetsPlugin(mutation.variables, plugin);
  const desiredEnabled = desiredSelectionChecked({
    inventory,
    item: plugin,
    mutation: mutation.variables,
    operation: mutation.operation,
  });
  const disableable =
    management?.disableable ??
    plugin.desired?.disableable ??
    plugin.active?.disableable ??
    false;
  const selectionAuthoringEnabled =
    pluginManagement.selectionAuthority !== null;
  const restoreVisible =
    (management?.hasRootDifference ?? false) || restoreWasVisible;
  const currentOperation =
    mutation.operation &&
    operationMatchesInventory(mutation.operation, inventory)
      ? mutation.operation
      : null;
  const mutationError =
    isMutationTarget &&
    mutation.error instanceof Error &&
    (!mutation.operation || currentOperation)
      ? mutation.error.message
      : null;
  const state = pluginStatusPresentation({
    inventory,
    item: plugin,
    mutation: mutation.variables,
    operation: mutation.operation,
  });

  return (
    <div {...stylex.props(styles.detailRoot)}>
      <header {...stylex.props(styles.detailHeader)}>
        <div {...stylex.props(styles.detailIdentity)}>
          <h1 {...stylex.props(styles.detailTitle)}>
            {plugin.packageId}/{plugin.instanceKey}
          </h1>
          <span {...stylex.props(styles.secondary)}>
            {pluginOriginLabel(plugin)} · {plugin.packageRevision || "linked"}
          </span>
        </div>
        <div {...stylex.props(styles.detailActions)}>
          {authoringEnabled ? (
            <PluginAgentAction
              instanceKey={plugin.instanceKey}
              managementRevision={pluginManagement.revision}
              packageId={plugin.packageId}
              rootConfigurationToml={management?.rootConfigurationToml}
              sourceDigest={management?.sourceDigest}
              targetAgentId={agentId}
            />
          ) : null}
          <PluginStatus state={state} />
        </div>
      </header>

      <PageHeader.Panel value="configuration" xstyle={styles.tabPanel}>
        {management ? (
          <PluginConfigurationSection
            agentId={agentId}
            authoringEnabled={authoringEnabled}
            draftStore={configurationDraftStore}
            inventory={inventory}
            management={management}
            mutation={mutation}
            plugin={plugin}
            pluginManagement={pluginManagement}
            proposal={proposal}
            rollback={rollback}
            restoreVisible={restoreVisible}
            selectionControl={
              <DetailSection>
                <div {...stylex.props(styles.controlRow)}>
                  <div {...stylex.props(styles.controlCopy)}>
                    <span {...stylex.props(styles.controlTitle)}>
                      Include in desired Plan
                    </span>
                    <span {...stylex.props(styles.controlDescription)}>
                      {disableable
                        ? selectionAuthoringEnabled
                          ? "The active state changes only after the next Generation passes its Ready-Gate."
                          : "The selected Plugin authority does not support selection changes."
                        : "This Host requires the Instance and does not allow removing it from the desired Plan."}
                    </span>
                  </div>
                  <span {...stylex.props(styles.controlSwitchSlot)}>
                    <Switch.Root
                      aria-label={`Include ${plugin.packageId}/${plugin.instanceKey} in the desired Plan`}
                      checked={desiredEnabled}
                      disabled={
                        !authoringEnabled ||
                        !selectionAuthoringEnabled ||
                        !disableable ||
                        mutation.isPending
                      }
                      onCheckedChange={(checked) => {
                        proposal.reset();
                        rollback.reset();
                        mutation.reset();
                        mutation.mutate({
                          enabled: checked,
                          expectedRevision: pluginManagement.revision,
                          expectedStreamId: inventory.streamId,
                          instanceKey: plugin.instanceKey,
                          packageId: plugin.packageId,
                          type: "select",
                        });
                      }}
                      layout="control-only"
                      size="default"
                    >
                      <Switch.Thumb />
                    </Switch.Root>
                  </span>
                </div>
              </DetailSection>
            }
          />
        ) : (
          <DetailSection title="Desired authoring state">
            <p {...stylex.props(styles.feedback)}>
              This Instance is no longer present in the Plugin Root authoring
              state. Its active Generation remains observable until routing
              switches.
            </p>
          </DetailSection>
        )}

        {isMutationTarget && (mutationError || currentOperation) ? (
          <DetailSection title="Latest change">
            <p
              aria-live={mutationError ? undefined : "polite"}
              role={mutationError ? "alert" : undefined}
              {...stylex.props(
                styles.feedback,
                Boolean(mutationError) && styles.feedbackError
              )}
            >
              {mutationError ??
                (currentOperation?.status === "switched"
                  ? "The Host switched routing to the prepared Generation."
                  : state.description)}
            </p>
          </DetailSection>
        ) : null}

        {plugin.rootSupplied && management ? (
          <DetailSection title="Plugin Root">
            <RemovePluginDialog
              disabled={!authoringEnabled || !selectionAuthoringEnabled}
              error={
                mutation.variables?.type === "remove" &&
                mutation.variables.packageId === plugin.packageId &&
                mutation.error instanceof Error
                  ? mutation.error
                  : null
              }
              isPending={mutation.isPending}
              onRemove={async () => {
                proposal.reset();
                rollback.reset();
                await mutation.mutateAsync({
                  expectedStreamId: inventory.streamId,
                  packageId: plugin.packageId,
                  type: "remove",
                });
                configurationDraftStore.discardPrefix(`${plugin.packageId}/`);
              }}
              packageId={plugin.packageId}
            />
          </DetailSection>
        ) : null}
      </PageHeader.Panel>

      <PageHeader.Panel
        value="capabilities"
        xstyle={[styles.tabPanel, styles.tabPanelFocused]}
      >
        <DetailSection title="Provided capabilities">
          <div {...stylex.props(styles.capabilities)}>
            {plugin.active?.providedCapabilities.length ? (
              plugin.active.providedCapabilities.map((capability) => (
                <code key={capability} {...stylex.props(styles.capability)}>
                  {capability}
                </code>
              ))
            ) : (
              <span {...stylex.props(styles.value)}>
                No capabilities provided by the active Instance.
              </span>
            )}
          </div>
        </DetailSection>
      </PageHeader.Panel>

      <PageHeader.Panel value="technical" xstyle={styles.tabPanel}>
        <DetailListSection title="Package and authority">
          <Detail label="Package" value={plugin.packageId} mono />
          <Detail
            label={plugin.active ? "Active revision" : "Resolved revision"}
            value={plugin.packageRevision || "linked into Host"}
          />
          {plugin.desired &&
          plugin.desired.packageRevision !== plugin.packageRevision ? (
            <Detail
              label="Desired revision"
              value={plugin.desired.packageRevision}
            />
          ) : null}
          <Detail
            label="Authority"
            value={
              management
                ? plugin.rootSupplied
                  ? "Plugin Root"
                  : "Host Catalog"
                : "Active Generation only"
            }
          />
        </DetailListSection>
        <PluginTechnicalDetails inventory={inventory} plugin={plugin} />
      </PageHeader.Panel>
    </div>
  );
}

function PluginConfigurationSection({
  agentId,
  authoringEnabled,
  draftStore,
  inventory,
  management,
  mutation,
  plugin,
  pluginManagement,
  proposal,
  rollback,
  restoreVisible,
  selectionControl,
}: {
  agentId: string;
  authoringEnabled: boolean;
  draftStore: PluginConfigurationDraftStore;
  inventory: PluginInventory;
  management: NonNullable<PluginWorkbenchItem["management"]>;
  mutation: ReturnType<typeof usePluginMutation>;
  plugin: PluginWorkbenchItem;
  pluginManagement: PluginManagement;
  proposal: ReturnType<typeof usePluginConfigurationProposal>;
  rollback: ReturnType<typeof usePluginConfigurationRollbackProposal>;
  restoreVisible: boolean;
  selectionControl: ReactNode;
}) {
  const hostToml = management.rootConfigurationToml ?? "";
  const draft = usePluginConfigurationDraft({
    draftKey: pluginKey(plugin),
    source: { sourceDigest: management.sourceDigest, toml: hostToml },
    store: draftStore,
    streamId: inventory.streamId,
  });
  const historyAvailable =
    pluginManagement.configurationAuthority.publicationHistory;
  const history = usePluginConfigurationHistory({
    agentId,
    enabled: pluginHistoryQueryEnabled(
      historyAvailable,
      true,
      authoringEnabled
    ),
    instanceKey: plugin.instanceKey,
    packageId: plugin.packageId,
    revision: pluginManagement.revision,
    sourceDigest: management.sourceDigest,
    streamId: inventory.streamId,
  });
  const proposalRequestIsCurrent =
    proposal.variables?.expectedRevision === pluginManagement.revision &&
    proposal.variables.expectedSourceDigest === management.sourceDigest &&
    proposal.variables.streamId === inventory.streamId &&
    proposal.variables.instanceKey === plugin.instanceKey &&
    proposal.variables.packageId === plugin.packageId;
  const rollbackRequestIsCurrent =
    rollback.variables?.expectedRevision === pluginManagement.revision &&
    rollback.variables.expectedSourceDigest === management.sourceDigest &&
    rollback.variables.streamId === inventory.streamId &&
    rollback.variables.instanceKey === plugin.instanceKey &&
    rollback.variables.packageId === plugin.packageId;
  const currentProposal =
    proposalRequestIsCurrent &&
    proposal.data?.baseRevision === pluginManagement.revision &&
    proposal.data.baseSourceDigest === management.sourceDigest &&
    proposal.data.instanceKey === plugin.instanceKey &&
    proposal.data.pluginId === plugin.packageId
      ? proposal.data
      : undefined;
  const currentRollback: PluginConfigurationRollbackProposal | undefined =
    rollbackRequestIsCurrent &&
    rollback.data?.proposal.baseRevision === pluginManagement.revision &&
    rollback.data.proposal.baseSourceDigest === management.sourceDigest &&
    rollback.data.proposal.instanceKey === plugin.instanceKey &&
    rollback.data.proposal.pluginId === plugin.packageId
      ? rollback.data
      : undefined;
  const reviewedProposal = currentRollback?.proposal ?? currentProposal;
  const readyProposalPresentation = configurationProposalReadyPresentation(
    reviewedProposal,
    shortRevision(reviewedProposal?.candidateRevision ?? "")
  );
  const readyRollbackPresentation = rollbackProposalReadyPresentation(
    currentRollback?.proposal,
    shortRevision(currentRollback?.proposal.candidateRevision ?? "")
  );
  const reviewError =
    proposalRequestIsCurrent && proposal.error instanceof Error
      ? proposal.error.message
      : rollbackRequestIsCurrent && rollback.error instanceof Error
        ? rollback.error.message
        : null;
  const proposalPending = proposalRequestIsCurrent && proposal.isPending;
  const rollbackPending = rollbackRequestIsCurrent && rollback.isPending;
  const hasConfigurationSchema = plugin.configurationSchema !== null;
  const [configurationView, setConfigurationView] = useState<
    "fields" | "advanced"
  >(hasConfigurationSchema ? "fields" : "advanced");

  const resetReviews = () => {
    proposal.reset();
    rollback.reset();
    mutation.reset();
  };

  return (
    <div {...stylex.props(styles.configurationLayout)}>
      <div {...stylex.props(styles.configurationMain)}>
        {selectionControl}
        <DetailSection>
          <div {...stylex.props(styles.configurationHeading)}>
            <h3 {...stylex.props(styles.sectionTitle)}>Configuration</h3>
            {hasConfigurationSchema ? (
              <SegmentedControl.Root
                aria-label="Configuration editor"
                onValueChange={(value) =>
                  setConfigurationView(value as "fields" | "advanced")
                }
                value={configurationView}
              >
                <SegmentedControl.Item value="fields">
                  Fields
                </SegmentedControl.Item>
                <SegmentedControl.Item value="advanced">
                  Advanced
                </SegmentedControl.Item>
              </SegmentedControl.Root>
            ) : null}
          </div>
          {configurationView === "fields" && plugin.configurationSchema ? (
            <PluginConfigurationFields
              defaults={plugin.configurationDefaults}
              disabled={!authoringEnabled}
              onChange={(value) => {
                resetReviews();
                draft.setValue(value);
              }}
              schema={plugin.configurationSchema}
              toml={draft.value}
            />
          ) : (
            <textarea
              aria-label={`TOML configuration for ${plugin.packageId}/${plugin.instanceKey}`}
              onChange={(event) => {
                resetReviews();
                draft.setValue(event.target.value);
              }}
              placeholder="# App-owned TOML override"
              readOnly={!authoringEnabled}
              spellCheck={false}
              value={draft.value}
              {...stylex.props(styles.editor)}
            />
          )}
          <div {...stylex.props(styles.editorActions)}>
            <Button
              aria-hidden={!restoreVisible}
              disabled={
                !authoringEnabled ||
                mutation.isPending ||
                !management.hasRootDifference
              }
              onClick={() => {
                proposal.reset();
                rollback.reset();
                mutation.reset();
                mutation.mutate({
                  expectedStreamId: inventory.streamId,
                  instanceKey: plugin.instanceKey,
                  packageId: plugin.packageId,
                  type: "reset",
                });
              }}
              size="compact"
              tabIndex={management.hasRootDifference ? 0 : -1}
              variant="ghost"
              {...stylex.props(!restoreVisible && styles.hiddenAction)}
            >
              <RotateCcw size={13} strokeWidth={1.75} />
              Restore Host value
            </Button>
            <Button
              disabled={
                !authoringEnabled ||
                proposalPending ||
                rollbackPending ||
                mutation.isPending ||
                !configurationChangeCanSubmit(
                  reviewedProposal,
                  draft.value,
                  hostToml
                )
              }
              onClick={() => {
                if (reviewedProposal?.status === "ready") {
                  mutation.reset();
                  mutation.mutate(
                    {
                      expectedRevision: reviewedProposal.baseRevision,
                      expectedSourceDigest: reviewedProposal.baseSourceDigest,
                      expectedStreamId: inventory.streamId,
                      instanceKey: plugin.instanceKey,
                      packageId: plugin.packageId,
                      proposalDigest: reviewedProposal.proposalDigest,
                      ...(currentRollback
                        ? {
                            rollbackOfProposalDigest:
                              currentRollback.rollbackOfProposalDigest,
                          }
                        : {}),
                      toml: draft.value,
                      type: "configure",
                    },
                    {
                      onSuccess: () => {
                        proposal.reset();
                        rollback.reset();
                      },
                    }
                  );
                  return;
                }
                proposal.reset();
                rollback.reset();
                mutation.reset();
                proposal.mutate({
                  expectedRevision: pluginManagement.revision,
                  expectedSourceDigest: management.sourceDigest,
                  instanceKey: plugin.instanceKey,
                  packageId: plugin.packageId,
                  streamId: inventory.streamId,
                  toml: draft.value,
                });
              }}
              size="compact"
              variant="primary"
            >
              {readyRollbackPresentation?.actionLabel ??
                readyProposalPresentation?.actionLabel ??
                "Preview change"}
            </Button>
          </div>
          {draft.hasExternalChange ? (
            <div {...stylex.props(styles.editorActions)}>
              <p role="alert" {...stylex.props(styles.feedback)}>
                Host configuration changed while this draft was open. The draft
                is preserved and must be previewed against the latest revision.
              </p>
              <Button
                onClick={() => {
                  proposal.reset();
                  rollback.reset();
                  mutation.reset();
                  draft.useHostValue();
                }}
                size="compact"
                variant="ghost"
              >
                Use Host value
              </Button>
            </div>
          ) : null}
          {reviewError ? (
            <p
              role="alert"
              {...stylex.props(styles.feedback, styles.feedbackError)}
            >
              {reviewError}
            </p>
          ) : reviewedProposal?.status === "ready" ? (
            <p aria-live="polite" {...stylex.props(styles.feedback)}>
              {readyRollbackPresentation?.description ??
                readyProposalPresentation?.description}
            </p>
          ) : reviewedProposal ? (
            <p
              role="alert"
              {...stylex.props(styles.feedback, styles.feedbackError)}
            >
              {reviewedProposal.diagnostics[0]?.detail ??
                "This configuration cannot be published."}
            </p>
          ) : null}
          <p {...stylex.props(styles.feedback)}>
            Desired {shortRevision(pluginManagement.revision)} · Applied{" "}
            {shortRevision(inventory.appliedRevision)} ·{" "}
            {pluginConfigurationStatusLabel(inventory.configurationStatus)} ·
            Source{" "}
            {configurationAuthorityLabel(
              pluginManagement.configurationAuthority
            )}
            {` · ${pluginManagement.configurationAuthority.reference}`}
          </p>
        </DetailSection>
      </div>
      {historyAvailable ? (
        <PluginConfigurationHistorySection
          authoringEnabled={authoringEnabled}
          history={history}
          mutationPending={mutation.isPending}
          onReview={(publicationProposalDigest) => {
            proposal.reset();
            rollback.reset();
            mutation.reset();
            rollback.mutate(
              {
                expectedRevision: pluginManagement.revision,
                expectedSourceDigest: management.sourceDigest,
                instanceKey: plugin.instanceKey,
                packageId: plugin.packageId,
                publicationProposalDigest,
                streamId: inventory.streamId,
              },
              {
                onSuccess: (review) => {
                  draft.useReviewedValue(review.configurationToml, {
                    sourceDigest: review.proposal.baseSourceDigest,
                    streamId: inventory.streamId,
                  });
                },
              }
            );
          }}
          proposalPending={proposalPending}
          currentToml={management.rootConfigurationToml}
          rollbackPending={rollbackPending}
          rollbackSupported={
            pluginManagement.configurationAuthority.rollbackProposals
          }
        />
      ) : null}
    </div>
  );
}

function PluginConfigurationHistorySection({
  authoringEnabled,
  currentToml,
  history,
  mutationPending,
  onReview,
  proposalPending,
  rollbackPending,
  rollbackSupported,
}: {
  authoringEnabled: boolean;
  currentToml: string | null;
  history: ReturnType<typeof usePluginConfigurationHistory>;
  mutationPending: boolean;
  onReview: (publicationProposalDigest: string) => void;
  proposalPending: boolean;
  rollbackPending: boolean;
  rollbackSupported: boolean;
}) {
  const publications = history.data?.publications;
  return (
    <section
      aria-labelledby="plugin-configuration-history-title"
      {...stylex.props(styles.historySection)}
    >
      <div {...stylex.props(styles.historyHeader)}>
        <h3
          id="plugin-configuration-history-title"
          {...stylex.props(styles.sectionTitle)}
        >
          Publication history
        </h3>
        <p {...stylex.props(styles.historyDescription)}>
          Previously accepted configuration versions.
        </p>
      </div>
      {history.error && publications ? (
        <div {...stylex.props(styles.editorActions)}>
          <p role="alert" {...stylex.props(styles.feedback)}>
            Showing the last verified publication history because the latest
            refresh failed.
          </p>
          <Button
            disabled={history.isFetching}
            onClick={() => {
              void history.refetch();
            }}
            size="compact"
            variant="ghost"
          >
            Try again
          </Button>
        </div>
      ) : null}
      {publications ? (
        publications.length === 0 ? (
          <p {...stylex.props(styles.feedback)}>
            No configuration has been published yet.
          </p>
        ) : (
          <div {...stylex.props(styles.historyList)}>
            {publications.map((publication) => {
              const isCurrent = configurationPublicationIsCurrent(
                publication.configurationToml,
                currentToml
              );
              return (
                <div
                  key={publication.proposalDigest}
                  {...stylex.props(styles.historyRow)}
                >
                  <div {...stylex.props(styles.historyIdentity)}>
                    <span {...stylex.props(styles.historyTitle)}>
                      {formatPublicationTime(publication.publishedAtUnixMs)}
                      {isCurrent ? " · Current content" : ""}
                      {publication.rollbackOfProposalDigest
                        ? " · Rollback"
                        : ""}
                    </span>
                    <span {...stylex.props(styles.historyMeta)}>
                      {shortRevision(publication.revision)} · proposal{" "}
                      {shortRevision(publication.proposalDigest)}
                    </span>
                  </div>
                  {rollbackSupported && !isCurrent ? (
                    <Button
                      disabled={
                        !authoringEnabled ||
                        rollbackPending ||
                        proposalPending ||
                        mutationPending
                      }
                      onClick={() => onReview(publication.proposalDigest)}
                      size="compact"
                      variant="ghost"
                      {...stylex.props(styles.historyAction)}
                    >
                      Review rollback
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : history.isPending ? (
        <p {...stylex.props(styles.feedback)}>Loading publications…</p>
      ) : (
        <div {...stylex.props(styles.editorActions)}>
          <p
            role="alert"
            {...stylex.props(styles.feedback, styles.feedbackError)}
          >
            Publication history could not be loaded.
          </p>
          <Button
            disabled={history.isFetching}
            onClick={() => {
              void history.refetch();
            }}
            size="compact"
            variant="ghost"
          >
            Try again
          </Button>
        </div>
      )}
    </section>
  );
}

function PluginTechnicalDetails({
  inventory,
  plugin,
}: {
  inventory: PluginInventory;
  plugin: PluginWorkbenchItem;
}) {
  const technical = pluginTechnicalSelection(plugin);
  return (
    <DetailListSection title="Runtime and revisions">
      <Detail
        label="Instance"
        value={`${plugin.packageId}/${plugin.instanceKey}`}
        mono
      />
      <Detail
        label={`${technical.phase} entrypoint`}
        value={technical.selection?.entrypoint ?? "Unavailable"}
        mono
      />
      <Detail
        label={`${technical.phase} execution`}
        value={technical.selection?.executionClass ?? "Unavailable"}
        mono
      />
      <Detail
        label={`${technical.phase} requires`}
        value={technical.selection?.requiredCapabilities.join(", ") || "None"}
        mono
      />
      <Detail label="Desired" value={plugin.desired ? "Present" : "Absent"} />
      <Detail
        label="Preparing"
        value={plugin.preparing ? "Present" : "Absent"}
      />
      <Detail label="Active" value={plugin.active ? "Present" : "Absent"} />
      <Detail
        label="Active package revision"
        value={plugin.active?.packageRevision ?? "Absent"}
        mono
      />
      <Detail
        label="Desired package revision"
        value={plugin.desired?.packageRevision ?? "Absent"}
        mono
      />
      <Detail
        label="Preparing package revision"
        value={plugin.preparing?.packageRevision ?? "Absent"}
        mono
      />
      <Detail label="Event cursor" value={inventory.cursor} mono />
      <Detail
        label="Configuration"
        value={pluginConfigurationStatusLabel(inventory.configurationStatus)}
      />
      <Detail
        label="Configuration source digest"
        value={plugin.management?.sourceDigest ?? "Unavailable"}
        mono
      />
      <Detail
        label="Applied Plugin Root revision"
        value={inventory.appliedRevision}
        mono
      />
      <Detail
        label="Desired authoring revision"
        value={inventory.desiredRevision}
        mono
      />
      <Detail
        label="Desired selection revision"
        value={inventory.desired.pluginRootRevision}
        mono
      />
      <Detail
        label="Preparing Plugin Root revision"
        value={inventory.preparing?.pluginRootRevision ?? "Not preparing"}
        mono
      />
      <Detail
        label="Active digest"
        value={inventory.active.generationSpecDigest}
        mono
      />
      <Detail
        label="Desired state digest"
        value={inventory.desired.desiredStateDigest}
        mono
      />
      <Detail
        label="Desired plan digest"
        value={inventory.desired.planDigest}
        mono
      />
      <Detail
        label="Preparing digest"
        value={inventory.preparing?.generationSpecDigest ?? "Not preparing"}
        mono
      />
    </DetailListSection>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section {...stylex.props(styles.section)}>
      {title ? <h3 {...stylex.props(styles.sectionTitle)}>{title}</h3> : null}
      {children}
    </section>
  );
}

function DetailListSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <DetailSection title={title}>
      <dl {...stylex.props(styles.fields)}>{children}</dl>
    </DetailSection>
  );
}

function Detail({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div {...stylex.props(styles.field)}>
      <dt {...stylex.props(styles.term)}>{label}</dt>
      <dd {...stylex.props(styles.value, mono && styles.mono)}>{value}</dd>
    </div>
  );
}

function configurationAuthorityLabel(
  authority: PluginConfigurationAuthority
): string {
  if (authority.kind === "local_plugin_root") {
    return "Local Plugin Root";
  }
  if (authority.kind === "sqlite_configuration_store") {
    return "Managed configuration";
  }
  return authority.kind === "remote_configuration_service"
    ? "Remote configuration"
    : authority.kind;
}

function formatPublicationTime(unixTimeMs: number): string {
  return publicationTimeFormatter.format(new Date(unixTimeMs));
}

function shortRevision(revision: string | null): string {
  if (!revision) {
    return "—";
  }
  return revision.startsWith("sha256:")
    ? revision.slice("sha256:".length, "sha256:".length + 8)
    : revision.slice(0, 8);
}
