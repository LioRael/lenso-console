import type { PluginWorkbenchRequest } from "./plugin-agent-workbench-context";
import {
  reviewPluginConfigurationDraft,
  type PluginConfigurationDraftStore,
} from "./plugin-configuration-draft";
import { pluginKey, type PluginWorkbenchItem } from "./plugin-workbench-model";

export type PluginWorkbenchRequestResult = {
  notice: string;
  selectedKey: string;
};

export function applyPluginWorkbenchRequest({
  draftStore,
  items,
  managementRevision,
  request,
}: {
  draftStore: PluginConfigurationDraftStore;
  items: readonly PluginWorkbenchItem[];
  managementRevision: string;
  request: PluginWorkbenchRequest;
}): PluginWorkbenchRequestResult | null {
  if (request.draftReview && !request.instanceKey) {
    return null;
  }
  const { instanceKey } = request;
  const requestedPlugin = instanceKey
    ? items.find(
        (plugin) => pluginKey(plugin) === `${request.packageId}/${instanceKey}`
      )
    : items.find((plugin) => plugin.packageId === request.packageId);
  if (!requestedPlugin) {
    return null;
  }
  const requestedKey = pluginKey(requestedPlugin);
  if (!(request.draftReview && requestedPlugin.management)) {
    return {
      notice:
        request.intent === "inspection"
          ? `Showing ${requestedKey} from the Agent inspection.`
          : `Showing ${requestedKey} after the Agent management action.`,
      selectedKey: requestedKey,
    };
  }
  const source = {
    sourceDigest: requestedPlugin.management.sourceDigest,
    toml: requestedPlugin.management.rootConfigurationToml ?? "",
  };
  draftStore.set(requestedKey, source, () =>
    reviewPluginConfigurationDraft(
      source,
      request.draftReview?.configurationToml ?? source.toml
    )
  );
  const stale =
    request.draftReview.baseRevision !== managementRevision ||
    request.draftReview.baseSourceDigest !== source.sourceDigest;
  return {
    notice: stale
      ? "Agent proposal imported as a draft after Host state changed. Preview it again against the current authority before publishing."
      : "Agent proposal imported as a draft. Preview it again in Console before publishing.",
    selectedKey: requestedKey,
  };
}
