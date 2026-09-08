import { parse } from "smol-toml";
import { expect, test } from "vitest";

import {
  absentConfigurationDigest,
  mcpConfiguration,
  type McpConnectionDraft,
} from "./mcp-connection-model";

const draft: McpConnectionDraft = {
  name: "example",
  transport: "streamable_http",
  endpoint: "https://example.com/mcp",
  authorization: "",
  program: "",
  arguments: "",
  directory: "",
  environment: "",
};
test("new-instance precondition matches the running Rust Host", async () => {
  expect(await absentConfigurationDigest("codex_mcp_validation")).toBe(
    "sha256:2713504aa01702b03a1c2a4fd22b9de544c2ca7dcee8ccc38c0a56ad93daa0e2"
  );
});
test("MCP configuration retains literal arguments and rejects unsafe input", () => {
  expect(
    parse(
      mcpConfiguration({
        ...draft,
        transport: "stdio",
        program: "/usr/bin/server",
        directory: "/tmp",
        arguments: '--name\nhello "world"\n$(literal)',
        environment: "API_KEY,PATH",
      })
    )
  ).toMatchObject({
    arguments: ["--name", 'hello "world"', "$(literal)"],
    environment_allowlist: ["API_KEY", "PATH"],
  });
  for (const endpoint of [
    "http://example.com/mcp",
    "https://user:secret@example.com/mcp",
    "https://example.com/mcp#fragment",
  ]) {
    expect(() => mcpConfiguration({ ...draft, endpoint })).toThrow();
  }
  expect(() => mcpConfiguration({ ...draft, name: "../other" })).toThrow();
  expect(() =>
    mcpConfiguration({ ...draft, authorization: "SECRET=value" })
  ).toThrow();
});
