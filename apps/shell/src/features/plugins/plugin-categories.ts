import type { PluginWorkbenchItem } from "./plugin-workbench-model";

// Presentation only: these groups never participate in admission or resolution.
// Match provided roles, not package names or requirements consumed by a Plugin.
export const pluginCategories = [
  { id: "all", label: "All", capabilities: [] },
  {
    id: "models",
    label: "Models",
    capabilities: ["lenso.agent.model", "lenso.agent.model-selection"],
  },
  {
    id: "tools",
    label: "Tools",
    capabilities: [
      "lenso.agent.tool-provider",
      "lenso.agent.tools",
      "lenso.agent.tool-target",
      "lenso.agent.workspace-read",
      "lenso.agent.http-fetch",
      "lenso.agent.process",
      "lenso.agent.worktree",
    ],
  },
  {
    id: "context",
    label: "Memory & context",
    capabilities: [
      "lenso.agent.memory",
      "lenso.agent.context-source",
      "lenso.agent.context-compaction",
      "lenso.agent.prompt",
      "lenso.agent.prompt-provider",
      "lenso.agent.session",
      "lenso.agent.artifact",
    ],
  },
  {
    id: "channels",
    label: "Channels",
    capabilities: [
      "lenso.agent.user-interaction",
      "lenso.agent.turn-input",
      "lenso.agent.session-presentation",
      "lenso.tui.panel",
      "lenso.tui.suggestion",
      "lenso.agent.tool-progress",
    ],
  },
  {
    id: "governance",
    label: "Governance & security",
    capabilities: [
      "lenso.agent.tool-hook",
      "lenso.agent.auth-connection",
      "lenso.agent.auth.openai-codex",
      "lenso.agent.oauth-access",
      "lenso.agent.plugin-configuration-authority",
      "lenso.agent.plugin-selection-authority",
      "lenso.agent.plugin-management-target",
      "lenso.agent.task-supervisor",
      "lenso.agent.session-control",
    ],
  },
  { id: "uncategorized", label: "Uncategorized", capabilities: [] },
] as const;

export type PluginCategory = (typeof pluginCategories)[number]["id"];
export type PluginSelectionFilter = "all" | "enabled" | "disabled";

export function categoriesForPlugin(
  plugin: PluginWorkbenchItem
): readonly PluginCategory[] {
  const selection = plugin.desired ?? plugin.active ?? plugin.preparing;
  const provided = new Set(
    selection?.providedCapabilities.map((id) => id.split("@")[0])
  );
  const matches = pluginCategories
    .filter((category) =>
      category.capabilities.some((capability) => provided.has(capability))
    )
    .map((category) => category.id);
  return matches.length ? matches : ["uncategorized"];
}

export function matchesPluginFilters(
  plugin: PluginWorkbenchItem,
  category: PluginCategory,
  query: string,
  selection: PluginSelectionFilter
) {
  const terms = query.trim().toLowerCase();
  return (
    (category === "all" || categoriesForPlugin(plugin).includes(category)) &&
    (!terms ||
      `${plugin.packageId}/${plugin.instanceKey}`
        .toLowerCase()
        .includes(terms)) &&
    (selection === "all" || plugin.management?.selection === selection)
  );
}
