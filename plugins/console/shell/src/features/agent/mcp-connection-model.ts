import { stringify } from "smol-toml";

import { absentPluginConfigurationDigest } from "../plugins/plugin-configuration-source";

export const MCP_PACKAGE = "lenso.agent.mcp-client";

export async function absentConfigurationDigest(instance: string) {
  return absentPluginConfigurationDigest(MCP_PACKAGE, instance);
}

export type McpConnectionDraft = {
  name: string;
  transport: "streamable_http" | "stdio";
  endpoint: string;
  authorization: string;
  program: string;
  arguments: string;
  directory: string;
  environment: string;
};
export function mcpConfiguration(draft: McpConnectionDraft) {
  if (!/^[a-z][a-z0-9_]{0,31}$/u.test(draft.name)) {
    throw new Error(
      "Use a name starting with a lowercase letter, followed by letters, numbers or underscores (up to 32 characters)."
    );
  }
  const config = {
    protocol: "auto",
    tool_namespace: draft.name,
    startup_timeout_ms: 10000,
    request_timeout_ms: 30000,
  };
  if (draft.transport === "stdio") {
    if (!draft.program.startsWith("/") || !draft.directory.startsWith("/")) {
      throw new Error(
        "Use absolute paths for the executable and working directory."
      );
    }
    return stringify({
      ...config,
      transport: "stdio",
      program: draft.program,
      arguments: draft.arguments.split("\n").filter(Boolean),
      working_directory: draft.directory,
      environment_allowlist: envNames(draft.environment),
    });
  }
  let url: URL;
  try {
    url = new URL(draft.endpoint);
  } catch {
    throw new Error("Enter a valid MCP server URL.");
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      "Use HTTPS, or HTTP for a local server. Do not embed credentials in the URL."
    );
  }
  const auth = envNames(draft.authorization);
  if (auth.length > 1) {
    throw new Error("Enter one Authorization environment variable name.");
  }
  return stringify({
    ...config,
    transport: "streamable_http",
    endpoint: draft.endpoint,
    ...(auth[0] ? { authorization_environment: auth[0] } : {}),
  });
}

function envNames(value: string) {
  const names = value.split(/[\s,]+/u).filter(Boolean);
  if (names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))) {
    throw new Error("Enter environment variable names, not secret values.");
  }
  return names;
}
