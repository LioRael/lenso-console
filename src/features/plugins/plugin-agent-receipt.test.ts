import { describe, expect, test } from "vitest";

import type { AgentToolCall } from "../agent/agent-runtime";
import { decodeAgentPluginReceipt } from "./plugin-agent-receipt";

const revisionA = `sha256:${"a".repeat(64)}`;
const revisionB = `sha256:${"b".repeat(64)}`;
const sourceDigest = `sha256:${"c".repeat(64)}`;
const proposalDigest = `sha256:${"d".repeat(64)}`;

describe("Plugin Agent receipts", () => {
  test("decodes an exact ready proposal with its candidate TOML", () => {
    expect(decodeAgentPluginReceipt(proposalTool())).toEqual({
      application: "app_generation",
      authority: { kind: "remote_configuration_service", reference: "app" },
      baseRevision: revisionA,
      baseSourceDigest: sourceDigest,
      candidateRevision: revisionB,
      configurationToml: "enabled = true\n",
      diagnostics: [],
      instanceKey: "default",
      kind: "proposal",
      packageId: "example.echo",
      proposalDigest,
      status: "ready",
    });
  });

  test("rejects a mismatched or truncated proposal result", () => {
    expect(
      decodeAgentPluginReceipt({
        ...proposalTool(),
        resultTruncated: true,
      })
    ).toBeNull();
    expect(
      decodeAgentPluginReceipt({
        ...proposalTool(),
        resultContent: proposalResult({ pluginId: "example.other" }),
      })
    ).toBeNull();
  });

  test("decodes a publication as desired state rather than applied state", () => {
    expect(
      decodeAgentPluginReceipt({
        ...proposalTool(),
        argumentsJson: JSON.stringify({
          configuration_toml: "enabled = true\n",
          expected_revision: revisionA,
          instance: "default",
          plugin_id: "example.echo",
          proposal_digest: proposalDigest,
        }),
        name: "apply_plugin_change",
        resultContent: JSON.stringify({
          authority: {
            kind: "remote_configuration_service",
            reference: "app",
          },
          baseRevision: revisionA,
          baseSourceDigest: sourceDigest,
          proposalDigest,
          revision: revisionB,
          schema: "lenso.plugin-configuration-publication.v1",
          status: "published_desired_state",
        }),
      })
    ).toMatchObject({
      kind: "publication",
      packageId: "example.echo",
      revision: revisionB,
    });
  });
});

function proposalTool(): AgentToolCall {
  return {
    argumentsJson: JSON.stringify({
      configuration_toml: "enabled = true\n",
      expected_revision: revisionA,
      instance: "default",
      plugin_id: "example.echo",
    }),
    callId: "call-1",
    name: "check_plugin_change",
    resultContent: proposalResult(),
    status: "completed",
  };
}

function proposalResult(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    application: "app_generation",
    authority: { kind: "remote_configuration_service", reference: "app" },
    baseRevision: revisionA,
    baseSourceDigest: sourceDigest,
    candidateRevision: revisionB,
    diagnostics: [],
    instance: "default",
    pluginId: "example.echo",
    proposalDigest,
    schema: "lenso.plugin-configuration-proposal.v1",
    status: "ready",
    ...overrides,
  });
}
