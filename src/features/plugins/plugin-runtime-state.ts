import type { PluginMutation } from "./plugin-control-client";
import type { PluginOperation } from "./plugin-operation";
import {
  pluginKey,
  type PluginConfigurationProposal,
  type PluginInventory,
  type PluginWorkbenchItem,
} from "./plugin-workbench-model";

export type PluginStatusTone =
  | "error"
  | "info"
  | "neutral"
  | "success"
  | "warning";

export type PluginStatusPresentation = {
  description: string;
  label: string;
  tone: PluginStatusTone;
};

export function configurationProposalReadyPresentation(
  proposal: PluginConfigurationProposal | undefined,
  candidateRevisionLabel: string
) {
  if (proposal?.status !== "ready") {
    return null;
  }
  if (proposal.application === "noop") {
    return {
      actionLabel: "Confirm configuration",
      description:
        "Preview ready. The resolved App Generation does not change, so publication can apply immediately.",
    };
  }
  return {
    actionLabel: "Publish configuration",
    description: `Preview ready. Publishing will create revision ${candidateRevisionLabel} and prepare a new App Generation.`,
  };
}

export function rollbackProposalReadyPresentation(
  proposal: PluginConfigurationProposal | undefined,
  candidateRevisionLabel: string
) {
  if (proposal?.status !== "ready") {
    return null;
  }
  if (proposal.application === "noop") {
    return {
      actionLabel: "Confirm rollback",
      description:
        "Rollback review ready. The resolved App Generation does not change, so publication can apply immediately.",
    };
  }
  return {
    actionLabel: "Publish rollback",
    description: `Rollback review ready. Publishing will create revision ${candidateRevisionLabel} and prepare a new App Generation.`,
  };
}

export function configurationChangeCanSubmit(
  proposal: PluginConfigurationProposal | undefined,
  draftToml: string,
  hostToml: string
) {
  return proposal?.status === "ready" || draftToml !== hostToml;
}

export function configurationPublicationIsCurrent(
  publicationToml: string,
  currentToml: string | null
) {
  return currentToml !== null && publicationToml === currentToml;
}

const PLUGIN_CONFIGURATION_STATUS_LABELS = {
  applied: "Applied",
  pending: "Pending",
  rejected: "Rejected",
} as const satisfies Record<PluginInventory["configurationStatus"], string>;

export function generationStatusPresentation({
  inventory,
  operation,
}: {
  inventory: PluginInventory;
  operation: PluginOperation | null;
}): PluginStatusPresentation {
  const currentOperation =
    operation && operationMatchesInventory(operation, inventory)
      ? operation
      : null;
  if (
    currentOperation?.status === "accepted" ||
    currentOperation?.status === "preparing"
  ) {
    return {
      description: "The desired App is being prepared before routing switches.",
      label: "Preparing Generation",
      tone: "info",
    };
  }
  if (currentOperation?.status === "rejected") {
    return {
      description:
        currentOperation.detail ?? "The Host rejected the desired Generation.",
      label: "Generation rejected",
      tone: "error",
    };
  }
  if (currentOperation?.status === "rolled_back") {
    return {
      description:
        currentOperation.detail ??
        "The Host kept the previous active Generation.",
      label: "Generation rolled back",
      tone: "warning",
    };
  }
  const event =
    inventory.configurationStatus === "applied"
      ? undefined
      : latestFailure(inventory);
  if (event?.status === "rejected") {
    return {
      description: event.detail ?? "The desired Generation was not activated.",
      label: "Generation rejected",
      tone: "error",
    };
  }
  if (event?.status === "rolled_back") {
    return {
      description: event.detail ?? "The previous Generation remains active.",
      label: "Generation rolled back",
      tone: "warning",
    };
  }
  if (inventory.configurationStatus === "rejected") {
    return {
      description:
        "The Host rejected the current Plugin Root revision. The previous active Generation is still serving new work.",
      label: "Configuration rejected",
      tone: "error",
    };
  }
  if (inventory.preparing) {
    return {
      description: "The Host is preparing the desired App Generation.",
      label: "Preparing Generation",
      tone: "info",
    };
  }
  if (
    inventory.truncated &&
    inventory.configurationStatus === "pending" &&
    (inventory.active.pluginRootRevision !== inventory.desiredRevision ||
      inventory.active.planDigest !== inventory.desired.planDigest)
  ) {
    return {
      description:
        "The desired and active Generations differ, but the retained event window does not prove whether preparation is still running or already ended.",
      label: "Generation state incomplete",
      tone: "warning",
    };
  }
  if (inventory.configurationStatus === "pending") {
    return {
      description:
        "The desired Plugin Root revision has not become the active Generation yet.",
      label: "Configuration pending",
      tone: "info",
    };
  }
  const watchDegraded = inventory.events
    .toReversed()
    .find((candidate) => candidate.status === "watch_degraded");
  if (watchDegraded) {
    return {
      description:
        watchDegraded.detail ??
        "Plugin folder watching is degraded; bounded periodic scanning remains active.",
      label: "Plugin watch degraded",
      tone: "warning",
    };
  }
  if (inventory.truncated) {
    return {
      description:
        "The active state is current, but part of the retained Generation event history is unavailable.",
      label: "Event history incomplete",
      tone: "warning",
    };
  }
  return {
    description: "The active Generation is serving new work.",
    label: "Generation active",
    tone: "success",
  };
}

export function pluginTechnicalSelection(plugin: PluginWorkbenchItem) {
  if (plugin.active) {
    return { phase: "Serving", selection: plugin.active } as const;
  }
  if (plugin.preparing) {
    return { phase: "Candidate", selection: plugin.preparing } as const;
  }
  if (plugin.desired) {
    return { phase: "Desired", selection: plugin.desired } as const;
  }
  return { phase: "Resolved", selection: null } as const;
}

export function pluginStatusPresentation({
  inventory,
  item,
  mutation,
  operation,
}: {
  inventory: PluginInventory;
  item: PluginWorkbenchItem;
  mutation: PluginMutation | undefined;
  operation: PluginOperation | null;
}): PluginStatusPresentation {
  if (
    operation &&
    operationMatchesInventory(operation, inventory) &&
    mutationTargetsPlugin(mutation, item)
  ) {
    if (operation.status === "accepted" || operation.status === "preparing") {
      return {
        description:
          "Desired state is saved. The active Generation has not switched yet.",
        label: "Preparing",
        tone: "info",
      };
    }
    if (operation.status === "rejected") {
      return {
        description:
          operation.detail ?? "The desired state failed the Host Ready-Gate.",
        label: "Rejected",
        tone: "error",
      };
    }
    if (operation.status === "rolled_back") {
      return {
        description:
          operation.detail ??
          "The Host restored the previous active Generation.",
        label: "Rolled back",
        tone: "warning",
      };
    }
  }
  if (item.active && item.desired) {
    if (!pluginSelectionIdentityMatches(item.active, item.desired)) {
      if (inventory.configurationStatus === "rejected") {
        return {
          description: `Active revision ${item.active.packageRevision} remains in service because desired revision ${item.desired.packageRevision} was rejected.`,
          label: "Desired rejected",
          tone: "error",
        };
      }
      return {
        description: `Active revision ${item.active.packageRevision} remains in service while desired revision ${item.desired.packageRevision} prepares.`,
        label: "Updating",
        tone: "info",
      };
    }
    return {
      description: "This Instance is present in the active and desired Plans.",
      label: "Active",
      tone: "success",
    };
  }
  if (item.active) {
    if (inventory.configurationStatus === "rejected") {
      return {
        description:
          "The desired removal was rejected, so this Instance remains in the active Generation.",
        label: "Removal rejected",
        tone: "error",
      };
    }
    return {
      description:
        "This Instance is still active while the desired Plan removes it.",
      label: "Retiring",
      tone: "warning",
    };
  }
  if (item.preparing) {
    return {
      description:
        "This Instance is in the candidate Generation, but is not active yet.",
      label: "Preparing",
      tone: "info",
    };
  }
  if (item.desired) {
    if (inventory.configurationStatus === "rejected") {
      return {
        description:
          "The desired addition was rejected, so this Instance is not part of the active Generation.",
        label: "Activation rejected",
        tone: "error",
      };
    }
    return {
      description:
        "This Instance is desired but is not part of the active Generation yet.",
      label: "Pending activation",
      tone: "info",
    };
  }
  return {
    description: "This Instance is absent from the active and desired Plans.",
    label: "Inactive",
    tone: "neutral",
  };
}

export function pluginSelectionIdentityMatches(
  left: NonNullable<PluginWorkbenchItem["active"]>,
  right: NonNullable<PluginWorkbenchItem["desired"]>
) {
  return (
    left.packageRevision === right.packageRevision &&
    left.entrypoint === right.entrypoint &&
    left.executionClass === right.executionClass &&
    left.disableable === right.disableable &&
    stringArraysEqual(left.providedCapabilities, right.providedCapabilities) &&
    stringArraysEqual(left.requiredCapabilities, right.requiredCapabilities)
  );
}

function stringArraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function desiredSelectionChecked({
  inventory,
  item,
  mutation,
  operation,
}: {
  inventory: PluginInventory;
  item: PluginWorkbenchItem;
  mutation: PluginMutation | undefined;
  operation: PluginOperation | null;
}) {
  const hasAcceptedDesiredOverride =
    operation?.status === "accepted" || operation?.status === "preparing";
  if (
    hasAcceptedDesiredOverride &&
    operationMatchesInventory(operation, inventory) &&
    mutation?.type === "select" &&
    mutationTargetsPlugin(mutation, item)
  ) {
    return mutation.enabled;
  }
  return Boolean(item.desired);
}

export function operationMatchesInventory(
  operation: PluginOperation,
  inventory: PluginInventory
) {
  if (operation.streamId !== inventory.streamId) {
    return false;
  }
  if (BigInt(inventory.cursor) > BigInt(operation.cursor)) {
    return false;
  }
  if (operation.pluginRootRevision === undefined) {
    return (
      operation.status === "rejected" &&
      BigInt(operation.cursor) >= BigInt(inventory.cursor)
    );
  }
  return (
    operation.pluginRootRevision === inventory.desiredRevision &&
    (operation.desiredStateDigest === undefined ||
      operation.desiredStateDigest === inventory.desired.desiredStateDigest) &&
    (operation.planDigest === undefined ||
      operation.planDigest === inventory.desired.planDigest)
  );
}

export function mutationTargetsPlugin(
  mutation: PluginMutation | undefined,
  plugin: PluginWorkbenchItem
) {
  if (!mutation || mutation.type === "install") {
    return false;
  }
  if (mutation.packageId !== plugin.packageId) {
    return false;
  }
  return (
    mutation.type === "remove" || mutation.instanceKey === plugin.instanceKey
  );
}

export function pluginOriginLabel(plugin: PluginWorkbenchItem) {
  if (plugin.management?.origin === "host-default") {
    return "Included by Host";
  }
  if (plugin.management?.origin === "plugin-root") {
    return "Added to Plugin Root";
  }
  if (plugin.active && !plugin.desired) {
    return "Active Generation only";
  }
  return "Resolved desired Plan";
}

export function pluginConfigurationStatusLabel(
  status: PluginInventory["configurationStatus"]
) {
  return PLUGIN_CONFIGURATION_STATUS_LABELS[status];
}

function latestFailure(inventory: PluginInventory) {
  const generationRevisions = new Map<string, string>();
  for (const event of inventory.events) {
    if (event.generationSpecDigest && event.pluginRootRevision) {
      generationRevisions.set(
        event.generationSpecDigest,
        event.pluginRootRevision
      );
    }
  }
  for (let index = inventory.events.length - 1; index >= 0; index -= 1) {
    const event = inventory.events[index];
    if (
      (event?.status === "preparing" || event?.status === "switched") &&
      event.pluginRootRevision === inventory.desiredRevision
    ) {
      return undefined;
    }
    if (
      event &&
      (event.status === "rejected" || event.status === "rolled_back")
    ) {
      const revision =
        event.pluginRootRevision ??
        (event.generationSpecDigest
          ? generationRevisions.get(event.generationSpecDigest)
          : undefined);
      if (revision === inventory.desiredRevision) {
        return event;
      }
    }
  }
  return undefined;
}

export function operationAppliesToKey(
  mutation: PluginMutation | undefined,
  key: string
) {
  if (!mutation || mutation.type === "install") {
    return false;
  }
  if (mutation.type === "remove") {
    return key.startsWith(`${mutation.packageId}/`);
  }
  return key === pluginKey(mutation);
}
