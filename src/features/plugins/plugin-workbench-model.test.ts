import { describe, expect, it } from "vitest";

import { decodePluginConfigurationPublication } from "./plugin-control-client";
import {
  decodePluginConfigurationHistory,
  decodePluginConfigurationProposal,
  decodePluginConfigurationRollbackProposal,
  decodePluginInventory,
  decodePluginManagement,
} from "./plugin-control-contract";
import {
  demoPluginConfigurationHistory,
  demoPluginInventory,
  demoPluginManagement,
  mergePluginInventory,
  pluginAuthoringIsReady,
  pluginManagementNeedsRefresh,
  pluginWorkbenchItems,
  type PluginInventory,
} from "./plugin-workbench-model";

describe("Plugin workbench state model", () => {
  it("decodes separate desired, preparing, and active authority", () => {
    expect(decodePluginInventory(demoPluginInventory)).toEqual(
      demoPluginInventory
    );
    expect(decodePluginManagement(demoPluginManagement)).toEqual(
      demoPluginManagement
    );
  });

  it("joins desired authoring state without treating it as active proof", () => {
    const inventory: PluginInventory = {
      ...demoPluginInventory,
      active: {
        ...demoPluginInventory.active,
        plugins: [],
      },
      preparing: {
        ...demoPluginInventory.desired,
        generationSpecDigest: "preparing-generation",
      },
    };
    const [plugin] = pluginWorkbenchItems(inventory, demoPluginManagement);

    expect(plugin).toMatchObject({
      active: null,
      desired: { executionClass: "lenso.native-rust@1" },
      instanceKey: "agent",
      packageId: "lenso.agent.loop",
      preparing: { executionClass: "lenso.native-rust@1" },
    });
  });

  it("keeps an active-only Instance visible while desired removal settles", () => {
    const inventory: PluginInventory = {
      ...demoPluginInventory,
      desired: { ...demoPluginInventory.desired, plugins: [] },
    };

    expect(
      pluginWorkbenchItems(inventory, { ...demoPluginManagement, plugins: [] })
    ).toEqual([
      expect.objectContaining({
        active: expect.objectContaining({
          instanceKey: "lenso.agent.loop/agent",
        }),
        desired: null,
        management: null,
        packageId: "lenso.agent.loop",
      }),
    ]);
  });

  it("merges cursor pages without losing or duplicating Generation events", () => {
    const pageOne: PluginInventory = {
      ...demoPluginInventory,
      cursor: "7",
      events: [{ cursor: "7", status: "rejected" }],
    };
    const pageTwo: PluginInventory = {
      ...demoPluginInventory,
      cursor: "9",
      events: [
        { cursor: "7", detail: "Ready-Gate failed", status: "rejected" },
        { cursor: "9", status: "switched" },
      ],
    };

    expect(mergePluginInventory(pageOne, pageTwo)).toMatchObject({
      cursor: "9",
      events: [
        { cursor: "7", detail: "Ready-Gate failed", status: "rejected" },
        { cursor: "9", status: "switched" },
      ],
    });
  });

  it("refreshes management for authoring revision changes, not lifecycle cursors", () => {
    expect(pluginManagementNeedsRefresh(null, "sha256:root-one")).toBe(false);
    expect(
      pluginManagementNeedsRefresh("sha256:root-one", "sha256:root-one")
    ).toBe(false);
    expect(
      pluginManagementNeedsRefresh("sha256:root-one", "sha256:root-two")
    ).toBe(true);
    expect(
      pluginAuthoringIsReady("sha256:root-one", "sha256:root-two", false)
    ).toBe(false);
    expect(
      pluginAuthoringIsReady("sha256:root-one", "sha256:root-one", true)
    ).toBe(false);
    expect(
      pluginAuthoringIsReady("sha256:root-one", "sha256:root-one", false)
    ).toBe(true);
  });

  it("keeps revision truth when the authoring state changes before the cursor", () => {
    const current = mergePluginInventory(demoPluginInventory, {
      ...demoPluginInventory,
      configurationStatus: "pending",
      desired: {
        ...demoPluginInventory.desired,
        pluginRootRevision: "sha256:root-next",
      },
      desiredRevision: "sha256:root-next",
    });

    expect(current).toMatchObject({
      configurationStatus: "pending",
      cursor: "0",
      desiredRevision: "sha256:root-next",
    });
  });

  it("drops events from a previous Host process when its cursor restarts", () => {
    const previous: PluginInventory = {
      ...demoPluginInventory,
      cursor: "42",
      events: [{ cursor: "42", status: "rejected" }],
      truncated: true,
    };
    const restarted: PluginInventory = {
      ...demoPluginInventory,
      cursor: "1",
      events: [{ cursor: "1", status: "switched" }],
    };

    expect(mergePluginInventory(previous, restarted)).toEqual(restarted);
  });

  it("rejects legacy inventory instead of presenting desired state as success", () => {
    expect(() =>
      decodePluginInventory({
        plugins: [],
        schema: "lenso.agent.plugin-inventory.v1",
      })
    ).toThrow("cursor-based Plugin inventory v2");
  });

  it("fails closed when inventory omits revision-based configuration truth", () => {
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        desiredRevision: undefined,
      })
    ).toThrow("desired Plugin Root revision");
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        configurationStatus: undefined,
      })
    ).toThrow("Plugin configuration status");
  });

  it("rejects inconsistent revision and cursor evidence", () => {
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        desiredRevision: "sha256:different-root",
      })
    ).toThrow("inconsistent desired Plugin Root revisions");
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        cursor: "2",
        events: [
          { cursor: "2", status: "switched" },
          { cursor: "1", status: "watch_degraded" },
        ],
      })
    ).toThrow("inconsistent Plugin inventory evidence");
  });

  it("rejects malformed management state instead of inventing placeholders", () => {
    expect(() =>
      decodePluginManagement({
        plugins: [{ packageId: "example.invalid" }],
        schema: "lenso.agent.plugin-management.v1",
      })
    ).toThrow("invalid managed Plugin entries");
  });

  it("decodes revision-fenced configuration preview and publication receipts", () => {
    const proposal = decodePluginConfigurationProposal({
      application: "app_generation",
      baseRevision: "sha256:root-active",
      candidateRevision: "sha256:root-next",
      configurationAuthority: demoPluginManagement.configurationAuthority,
      diagnostics: [],
      instanceKey: "agent",
      pluginId: "lenso.agent.loop",
      proposalDigest: "sha256:proposal",
      schema: "lenso.plugin-configuration-proposal.v1",
      status: "ready",
    });
    const publication = decodePluginConfigurationPublication({
      baseRevision: proposal.baseRevision,
      configurationAuthority: proposal.configurationAuthority,
      desired: {
        ...demoPluginInventory.desired,
        configurationStatus: "pending",
        desiredRevision: proposal.candidateRevision,
        pluginRootRevision: proposal.candidateRevision,
      },
      operation: {
        acceptedAfterCursor: "7",
        cursor: "7",
        desiredStateDigest: demoPluginInventory.desired.desiredStateDigest,
        id: "operation-id",
        planDigest: demoPluginInventory.desired.planDigest,
        pluginRootRevision: proposal.candidateRevision,
        status: "accepted",
      },
      publicationSchema: "lenso.plugin-configuration-publication.v1",
      publicationStatus: "published",
      proposalDigest: proposal.proposalDigest,
      revision: proposal.candidateRevision,
      schema: "lenso.agent.plugin-operation.v1",
    });

    expect(publication.operation.status).toBe("accepted");
    expect(publication.desired.configurationStatus).toBe("pending");
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
        proposalDigest: "demo-rollback-proposal",
        schema: "lenso.plugin-configuration-proposal.v1",
        status: "ready",
      },
      rollbackOfProposalDigest: previous.proposalDigest,
      schema: "lenso.agent.plugin-configuration-rollback-proposal.v1",
    });

    expect(history.publications).toHaveLength(2);
    expect(rollback.rollbackOfProposalDigest).toBe(previous.proposalDigest);
    expect(rollback.proposal.baseRevision).toBe(demoPluginManagement.revision);
  });

  it("rejects spoofed management authority and inconsistent publications", () => {
    expect(() =>
      decodePluginManagement({
        ...demoPluginManagement,
        configurationAuthority: { kind: "", reference: "app" },
      })
    ).toThrow("management authority");
    expect(() =>
      decodePluginConfigurationPublication({
        baseRevision: "sha256:root-active",
        configurationAuthority: demoPluginManagement.configurationAuthority,
        desired: {
          ...demoPluginInventory.desired,
          configurationStatus: "pending",
          desiredRevision: "sha256:root-next",
          pluginRootRevision: "sha256:other-root",
        },
        operation: {
          acceptedAfterCursor: "7",
          cursor: "7",
          desiredStateDigest: demoPluginInventory.desired.desiredStateDigest,
          id: "operation-id",
          planDigest: demoPluginInventory.desired.planDigest,
          pluginRootRevision: "sha256:root-next",
          status: "accepted",
        },
        publicationSchema: "lenso.plugin-configuration-publication.v1",
        publicationStatus: "published",
        proposalDigest: "sha256:proposal",
        revision: "sha256:root-next",
        schema: "lenso.agent.plugin-operation.v1",
      })
    ).toThrow("inconsistent configuration publication");
  });

  it("accepts named Profile exclusions as explicit desired state", () => {
    expect(
      decodePluginManagement({
        ...demoPluginManagement,
        plugins: [
          {
            ...demoPluginManagement.plugins[0],
            instances: [
              {
                ...demoPluginManagement.plugins[0]?.instances[0],
                selection: "excluded-by-profile",
              },
            ],
          },
        ],
      }).plugins[0]?.instances[0]?.selection
    ).toBe("excluded-by-profile");
  });
});
