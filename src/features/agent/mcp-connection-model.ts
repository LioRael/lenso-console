import { stringify } from "smol-toml";

export const MCP_PACKAGE = "lenso.agent.mcp-client";

// Matches lenso-cli's configuration_authority::source_digest_for_bytes(None).
// The Host rejects this precondition if the instance already has configuration.
export async function absentConfigurationDigest(instance: string) {
  const chunks = [
    "lenso.plugin-configuration-source.v1",
    MCP_PACKAGE,
    instance,
  ].map((value) => {
    const bytes = new TextEncoder().encode(value);
    const chunk = new Uint8Array(8 + bytes.length);
    new DataView(chunk.buffer).setBigUint64(0, BigInt(bytes.length));
    chunk.set(bytes, 8);
    return chunk;
  });
  const input = new Uint8Array(
    chunks.reduce((n, chunk) => n + chunk.length, 1)
  );
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = await crypto.subtle.digest("SHA-256", input);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
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
