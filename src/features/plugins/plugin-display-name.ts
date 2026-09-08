import type { PluginWorkbenchItem } from "./plugin-workbench-model";

export function pluginDisplayName(
  plugin: Pick<PluginWorkbenchItem, "packageId" | "instanceKey">
): string {
  const name = plugin.packageId
    .replace(/^lenso\.agent\./u, "")
    .replaceAll(/[._-]/gu, " ");
  return (name.charAt(0).toUpperCase() + name.slice(1))
    .replaceAll(/\bopenai\b/giu, "OpenAI")
    .replaceAll(/\bhttp\b/giu, "HTTP")
    .replaceAll(/\bmcp\b/giu, "MCP")
    .replaceAll(/\bsqlite\b/giu, "SQLite");
}
