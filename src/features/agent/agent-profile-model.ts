import type { PluginWorkbenchItem } from "../plugins/plugin-workbench-model";
import { agentApiUrl, agentHeaders } from "./agent-runtime";

export type ProfileDocument = {
  agent: string;
  description: string;
  include_enabled: boolean;
  instances: string[];
  excluded_instances: string[];
  allowed_tools: string[] | null;
  instructions: string;
  model: string | null;
  [key: string]: unknown;
};
export type EditableProfile = {
  name: string;
  revision: string;
  readOnly: boolean;
  document: ProfileDocument;
};
export type ProfileCatalog = {
  profiles: EditableProfile[];
  activeProfile: string | null;
  activeRevision: string | null;
};
export async function profileRequest<T>(
  agentId: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(agentApiUrl(agentId, path), {
    method: body === undefined ? "GET" : "POST",
    headers: agentHeaders("application/json", body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  const result = await response
    .json()
    .catch(() => ({ detail: `Profile request failed (${response.status})` }));
  if (!response.ok) {
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : `Profile request failed (${response.status})`
    );
  }
  return result as T;
}
export function providerId(item: PluginWorkbenchItem) {
  return item.instanceKey.startsWith(`${item.packageId}/`)
    ? item.instanceKey
    : `${item.packageId}/${item.instanceKey}`;
}
export function providerGroup(item: PluginWorkbenchItem): string {
  const capabilities =
    (item.desired ?? item.active ?? item.preparing)?.providedCapabilities ?? [];
  if (capabilities.some((id) => id.startsWith("lenso.agent.tool-hook@"))) {
    return "Instruments";
  }
  // Built-in Skills expose prompt/tool-provider contracts rather than a dedicated Skill capability.
  if (item.packageId === "lenso.agent.skills.filesystem") {
    return "Skills & context";
  }
  if (
    capabilities.some(
      (id) =>
        id.startsWith("lenso.agent.skill") ||
        id.startsWith("lenso.agent.context-source@")
    )
  ) {
    return "Skills & context";
  }
  if (
    capabilities.some(
      (id) =>
        id.startsWith("lenso.agent.tools@") ||
        id.startsWith("lenso.agent.tool-provider@")
    )
  ) {
    return "Tool providers & MCP";
  }
  return "Other providers";
}
export function providerEnabled(
  document: ProfileDocument,
  item: PluginWorkbenchItem
) {
  const id = providerId(item);
  if (document.excluded_instances.includes(id)) {
    return false;
  }
  if (document.instances.includes(id)) {
    return true;
  }
  return (
    (item.management?.origin === "host-default" || document.include_enabled) &&
    item.management?.selection !== "disabled-by-root"
  );
}
export function toggleProviders(
  document: ProfileDocument,
  items: PluginWorkbenchItem[],
  enabled: boolean
): ProfileDocument {
  const instances = new Set(document.instances);
  const excluded = new Set(document.excluded_instances);
  for (const item of items) {
    const id = providerId(item);
    if (id === document.agent || !item.management?.disableable) {
      continue;
    }
    if (enabled) {
      excluded.delete(id);
      if (item.management.origin === "plugin-root") {
        instances.add(id);
      }
    } else {
      instances.delete(id);
      excluded.add(id);
    }
  }
  return {
    ...document,
    instances: [...instances].sort(),
    excluded_instances: [...excluded].sort(),
  };
}
export function toggleTools(
  document: ProfileDocument,
  names: string[],
  enabled: boolean,
  inherited: string[]
): ProfileDocument {
  const allowed = new Set(document.allowed_tools ?? inherited);
  for (const name of names) {
    if (enabled) {
      allowed.add(name);
    } else {
      allowed.delete(name);
    }
  }
  return { ...document, allowed_tools: [...allowed].sort() };
}
