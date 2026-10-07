import { categoriesForPlugin, pluginCategories } from "./plugin-categories";
import type { PluginWorkbenchItem } from "./plugin-workbench-model";

export function pluginPurpose(plugin: PluginWorkbenchItem): string {
  const description = plugin.configurationSchema?.description;
  if (typeof description === "string" && description.trim()) {
    return description.trim();
  }
  const provided =
    (plugin.desired ?? plugin.active ?? plugin.preparing)
      ?.providedCapabilities ?? [];
  if (provided.some((role) => role.split("@")[0] === "lenso.agent")) {
    return "Agent runtime";
  }
  const categories = categoriesForPlugin(plugin);
  const labels = pluginCategories
    .filter(
      (category) =>
        category.id !== "uncategorized" && categories.includes(category.id)
    )
    .map((category) => category.label);
  // A category is factual role metadata, not a guessed marketing description.
  return labels.length ? labels.join(" · ") : plugin.packageId;
}
