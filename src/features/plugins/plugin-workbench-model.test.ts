import { describe, expect, it } from "vitest";

import {
  decodePluginConfigurationHistory,
  decodePluginConfigurationProposal,
  decodePluginConfigurationPublication,
  decodePluginConfigurationRollbackProposal,
  decodePluginInventory,
  decodePluginManagement,
  demoPluginInventory,
  demoPluginConfigurationHistory,
  demoPluginManagement,
  pluginWorkbenchItems,
} from "./plugin-workbench-model";

describe("Plugin workbench management model", () => {
  it("decodes the Host-authorized management contract", () => {
    expect(decodePluginManagement(demoPluginManagement)).toEqual(
      demoPluginManagement
    );
  });

  it("joins desired Plugin Root state to active technical inventory", () => {
    const [plugin] = pluginWorkbenchItems(
      demoPluginInventory,
      demoPluginManagement
    );

    expect(plugin).toMatchObject({
      active: { executionClass: "lenso.native-rust@1" },
      instanceKey: "agent",
      packageId: "lenso.agent.loop",
      selection: "enabled",
    });
  });

  it("rejects malformed management state instead of inventing placeholders", () => {
    expect(() =>
      decodePluginManagement({
        plugins: [{ packageId: "example.invalid" }],
        schema: "lenso.agent.plugin-management.v1",
      })
    ).toThrow("invalid managed Plugin entries");
  });

  it("decodes revision-fenced configuration proposals and publications", () => {
    const { revision } = demoPluginManagement;
    const proposal = decodePluginConfigurationProposal({
      application: "app_generation",
      baseRevision: revision,
      candidateRevision: revision,
      configurationAuthority: demoPluginManagement.configurationAuthority,
      diagnostics: [],
      instanceKey: "agent",
      pluginId: "lenso.agent.loop",
      proposalDigest: revision,
      schema: "lenso.plugin-configuration-proposal.v1",
      status: "ready",
    });
    const publication = decodePluginConfigurationPublication({
      baseRevision: proposal.baseRevision,
      configurationAuthority: proposal.configurationAuthority,
      desired: demoPluginInventory,
      proposalDigest: proposal.proposalDigest,
      revision: proposal.candidateRevision,
      schema: "lenso.plugin-configuration-publication.v1",
      status: "published",
    });

    expect(publication.desired.configurationStatus).toBe("applied");
    expect(publication.configurationAuthority?.kind).toBe(
      "sqlite_configuration_store"
    );
  });

  it("decodes immutable publication history and a traceable rollback proposal", () => {
    const history = decodePluginConfigurationHistory(
      demoPluginConfigurationHistory
    );
    const [, previous] = history.publications;
    expect(previous).toBeDefined();
    if (!previous) {
      throw new TypeError("Fixture should include a previous publication");
    }
    const rollback = decodePluginConfigurationRollbackProposal({
      configurationToml: previous.configurationToml,
      proposal: {
        application: "app_generation",
        baseRevision: demoPluginManagement.revision,
        candidateRevision: previous.revision,
        configurationAuthority: history.configurationAuthority,
        diagnostics: [],
        instanceKey: history.instanceKey,
        pluginId: history.pluginId,
        proposalDigest:
          "sha256:7777777777777777777777777777777777777777777777777777777777777777",
        schema: "lenso.plugin-configuration-proposal.v1",
        status: "ready",
      },
      rollbackOfProposalDigest: previous.proposalDigest,
      schema: "lenso.agent.plugin-configuration-rollback-proposal.v1",
    });

    expect(history.publications).toHaveLength(2);
    expect(rollback.rollbackOfProposalDigest).toBe(previous.proposalDigest);
  });

  it("rejects malformed revisions and configuration state", () => {
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        configurationStatus: "switching",
      })
    ).toThrow("invalid Plugin configuration state");
    expect(() =>
      decodePluginConfigurationProposal({
        application: "app_generation",
        baseRevision: "sha256:not-a-digest",
        candidateRevision: demoPluginManagement.revision,
        configurationAuthority: demoPluginManagement.configurationAuthority,
        diagnostics: [],
        instanceKey: "agent",
        pluginId: "lenso.agent.loop",
        proposalDigest: demoPluginManagement.revision,
        schema: "lenso.plugin-configuration-proposal.v1",
        status: "ready",
      })
    ).toThrow("invalid configuration proposal");
    expect(() =>
      decodePluginManagement({
        ...demoPluginManagement,
        configurationAuthority: { kind: "", reference: "app" },
      })
    ).toThrow("invalid Plugin configuration authority");
  });
});
