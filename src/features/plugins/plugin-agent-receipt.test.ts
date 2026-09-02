import { describe, expect, test } from "vitest";

import type { AgentToolCall } from "../agent/agent-runtime";
import { decodeAgentPluginReceipt } from "./plugin-agent-receipt";

const revisionA = `sha256:${"a".repeat(64)}`;
const revisionB = `sha256:${"b".repeat(64)}`;
const sourceDigest = `sha256:${"c".repeat(64)}`;
const proposalDigest = `sha256:${"d".repeat(64)}`;

describe("Plugin Agent receipts", () => {
  test("decodes an exact App inspection without inventing runtime state", () => {
    expect(
      decodeAgentPluginReceipt(
        completedTool(
          "inspect_app",
          {},
          {
            authority: {
              kind: "remote_configuration_service",
              reference: "app",
            },
            bindingCount: 4,
            enabledInstanceCount: 2,
            pluginCount: 3,
            revision: revisionA,
            schema: "lenso.agent.console-app-inspection.v1",
          }
        )
      )
    ).toEqual({
      agentId: "app-agent",
      authority: { kind: "remote_configuration_service", reference: "app" },
      bindingCount: 4,
      enabledInstanceCount: 2,
      kind: "app_inspection",
      pluginCount: 3,
      revision: revisionA,
    });
  });

  test("decodes a bounded Plugin list and preserves its query", () => {
    expect(
      decodeAgentPluginReceipt(
        completedTool(
          "list_plugins",
          { query: "agent" },
          {
            authority: {
              kind: "sqlite_configuration_store",
              reference: "console",
            },
            plugins: [
              {
                enabledInstanceCount: 1,
                instanceCount: 1,
                packageId: "lenso.agent.loop",
                packageRevision: "linked",
                source: "host-default",
              },
            ],
            query: "agent",
            revision: revisionA,
            schema: "lenso.agent.console-plugin-list.v1",
          }
        )
      )
    ).toMatchObject({
      kind: "plugin_list",
      plugins: [{ packageId: "lenso.agent.loop" }],
      query: "agent",
    });
  });

  test("decodes an exact Plugin inspection and its Instance differences", () => {
    expect(
      decodeAgentPluginReceipt(
        completedTool(
          "inspect_plugin",
          { plugin_id: "lenso.agent.loop" },
          {
            authority: {
              kind: "local_plugin_root",
              reference: "/managed/app",
            },
            instances: [
              {
                disableable: false,
                hasRootDifference: true,
                instanceKey: "agent",
                origin: "host-default",
                rootConfigurationBytes: 42,
                selection: "enabled",
                sourceDigest,
              },
            ],
            packageId: "lenso.agent.loop",
            packageRevision: "linked",
            revision: revisionA,
            schema: "lenso.agent.console-plugin-inspection.v1",
            source: "host-default",
          }
        )
      )
    ).toMatchObject({
      instances: [
        {
          hasRootDifference: true,
          instanceKey: "agent",
          rootConfigurationBytes: 42,
        },
      ],
      kind: "plugin_inspection",
      packageId: "lenso.agent.loop",
    });
  });

  test("rejects inspection results that do not match their request", () => {
    expect(
      decodeAgentPluginReceipt(
        completedTool(
          "list_plugins",
          { query: "agent" },
          {
            authority: { kind: "local_plugin_root", reference: "app" },
            plugins: [],
            query: "other",
            revision: revisionA,
            schema: "lenso.agent.console-plugin-list.v1",
          }
        )
      )
    ).toBeNull();
    expect(
      decodeAgentPluginReceipt(
        completedTool(
          "inspect_plugin",
          { plugin_id: "lenso.agent.loop" },
          {
            authority: { kind: "local_plugin_root", reference: "app" },
            instances: [],
            packageId: "example.other",
            packageRevision: "linked",
            revision: revisionA,
            schema: "lenso.agent.console-plugin-inspection.v1",
            source: "host-default",
          }
        )
      )
    ).toBeNull();
  });

  test("decodes an exact ready proposal with its candidate TOML", () => {
    expect(decodeAgentPluginReceipt(proposalTool())).toEqual({
      agentId: "app-agent",
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
    expect(
      decodeAgentPluginReceipt({
        ...proposalTool(),
        resultContent: proposalResult({ agentId: "other-agent" }),
      })
    ).toBeNull();
  });

  test("decodes a publication as desired state rather than applied state", () => {
    expect(
      decodeAgentPluginReceipt({
        ...proposalTool(),
        argumentsJson: JSON.stringify({
          agent_id: "app-agent",
          configuration_toml: "enabled = true\n",
          expected_revision: revisionA,
          instance: "default",
          plugin_id: "example.echo",
          proposal_digest: proposalDigest,
        }),
        name: "apply_plugin_change",
        resultContent: JSON.stringify({
          agentId: "app-agent",
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

  test("decodes one exact Plugin selection change", () => {
    expect(
      decodeAgentPluginReceipt(
        completedTool(
          "set_plugin_enabled",
          {
            enabled: false,
            expected_revision: revisionA,
            instance: "default",
            plugin_id: "example.echo",
          },
          {
            authority: {
              kind: "sqlite_configuration_store",
              reference: "console",
            },
            baseRevision: revisionA,
            enabled: false,
            instance: "default",
            pluginId: "example.echo",
            revision: revisionB,
            schema: "lenso.plugin-selection-publication.v1",
            status: "disabled",
          }
        )
      )
    ).toEqual({
      agentId: "app-agent",
      authority: {
        kind: "sqlite_configuration_store",
        reference: "console",
      },
      baseRevision: revisionA,
      enabled: false,
      instanceKey: "default",
      kind: "selection",
      packageId: "example.echo",
      revision: revisionB,
    });
  });
});

function proposalTool(): AgentToolCall {
  return {
    argumentsJson: JSON.stringify({
      agent_id: "app-agent",
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
    agentId: "app-agent",
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

function completedTool(
  name: string,
  argumentsValue: Record<string, unknown>,
  result: Record<string, unknown>
): AgentToolCall {
  return {
    argumentsJson: JSON.stringify({ agent_id: "app-agent", ...argumentsValue }),
    callId: `call-${name}`,
    name,
    resultContent: JSON.stringify({ agentId: "app-agent", ...result }),
    status: "completed",
  };
}
