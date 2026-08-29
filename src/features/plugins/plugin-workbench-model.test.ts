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
  reconcilePluginSelectionKey,
  stablePluginSelectionKey,
  pluginWorkbenchItems,
  type PluginGenerationEvent,
  type PluginInventory,
  type PluginWorkbenchItem,
} from "./plugin-workbench-model";

function rejectedEvent(cursor: string): PluginGenerationEvent {
  return { cursor, detail: "Ready-Gate failed", status: "rejected" };
}

function switchedEvent(cursor: string): PluginGenerationEvent {
  return {
    cursor,
    desiredStateDigest: "demo-desired-state",
    generationSpecDigest: "demo-generation",
    planDigest: "demo-plan",
    pluginRootRevision: "demo-root",
    previousGenerationSpecDigest: "demo-generation-previous",
    routingEpoch: cursor,
    status: "switched",
  };
}

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

  it("keeps the default selection stable when a Plugin sorts before it", () => {
    const initial = pluginWorkbenchItems(
      demoPluginInventory,
      demoPluginManagement
    );
    const initialKey = stablePluginSelectionKey(null, initial);
    const inserted: readonly PluginWorkbenchItem[] = [
      {
        ...initial[0],
        instanceKey: "default",
        packageId: "a.example.first",
      },
      ...initial,
    ] as readonly PluginWorkbenchItem[];

    expect(initialKey).toBe("lenso.agent.loop/agent");
    expect(stablePluginSelectionKey(initialKey, inserted)).toBe(initialKey);
  });

  it("keeps the selected context while restarted Host management recovers", () => {
    expect(
      reconcilePluginSelectionKey("example.second/default", undefined)
    ).toBe("example.second/default");
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
      events: [rejectedEvent("7")],
    };
    const pageTwo: PluginInventory = {
      ...demoPluginInventory,
      cursor: "9",
      events: [rejectedEvent("8"), switchedEvent("9")],
    };

    expect(mergePluginInventory(pageOne, pageTwo)).toMatchObject({
      cursor: "9",
      events: [rejectedEvent("7"), rejectedEvent("8"), switchedEvent("9")],
    });
  });

  it("marks locally bounded event history as truncated", () => {
    const previous: PluginInventory = {
      ...demoPluginInventory,
      cursor: "64",
      events: Array.from({ length: 64 }, (_, index) =>
        rejectedEvent(String(index + 1))
      ),
    };
    const current: PluginInventory = {
      ...demoPluginInventory,
      cursor: "65",
      events: [rejectedEvent("65")],
    };

    const merged = mergePluginInventory(previous, current);

    expect(merged.events).toHaveLength(64);
    expect(merged.events[0]?.cursor).toBe("2");
    expect(merged.truncated).toBe(true);
  });

  it("rejects event pages that advance across an unreported cursor", () => {
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        cursor: "3",
        events: [rejectedEvent("1"), rejectedEvent("3")],
      })
    ).toThrow("inconsistent Plugin inventory evidence");

    expect(() =>
      mergePluginInventory(
        { ...demoPluginInventory, cursor: "1", events: [rejectedEvent("1")] },
        { ...demoPluginInventory, cursor: "3", events: [rejectedEvent("3")] }
      )
    ).toThrow("incomplete Plugin inventory event page");
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

  it("accepts same-revision pending state when non-root Desired inputs change", () => {
    expect(
      decodePluginInventory({
        ...demoPluginInventory,
        configurationStatus: "pending",
        desired: {
          ...demoPluginInventory.desired,
          desiredStateDigest: "sha256:resource-only-change",
        },
      }).configurationStatus
    ).toBe("pending");
  });

  it("drops events from a previous Host process when the stream changes", () => {
    const previous: PluginInventory = {
      ...demoPluginInventory,
      cursor: "42",
      events: [rejectedEvent("42")],
      truncated: true,
    };
    const restarted: PluginInventory = {
      ...demoPluginInventory,
      cursor: "1",
      events: [switchedEvent("1")],
      streamId: "new-host-stream",
    };

    expect(mergePluginInventory(previous, restarted)).toEqual(restarted);
  });

  it("fails closed when one Host stream regresses its cursor", () => {
    const previous: PluginInventory = {
      ...demoPluginInventory,
      cursor: "42",
      events: [rejectedEvent("42")],
    };

    expect(() =>
      mergePluginInventory(previous, {
        ...demoPluginInventory,
        cursor: "1",
        events: [switchedEvent("1")],
      })
    ).toThrow("regressed the Plugin cursor");
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
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        streamId: undefined,
      })
    ).toThrow("Plugin event stream");
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
          switchedEvent("2"),
          {
            cursor: "1",
            detail: "watch unavailable",
            status: "watch_degraded",
          },
        ],
      })
    ).toThrow("inconsistent Plugin inventory evidence");
  });

  it.each([
    {
      cursor: "1",
      desiredStateDigest: "demo-desired-state",
      generationSpecDigest: "demo-generation",
      planDigest: "demo-plan",
      pluginRootRevision: "demo-root",
      status: "preparing",
    },
    {
      cursor: "1",
      desiredStateDigest: "demo-desired-state",
      generationSpecDigest: "demo-generation",
      planDigest: "demo-plan",
      pluginRootRevision: "demo-root",
      previousGenerationSpecDigest: "demo-generation-previous",
      status: "switched",
    },
    {
      cursor: "1",
      detail: "candidate failed",
      generationSpecDigest: "demo-generation",
      routingEpoch: "2",
      status: "rolled_back",
    },
    { cursor: "1", status: "rejected" },
    { cursor: "1", status: "watch_degraded" },
  ])(
    "rejects Generation events missing status-specific evidence %#",
    (event) => {
      expect(() =>
        decodePluginInventory({
          ...demoPluginInventory,
          cursor: "1",
          events: [event],
        })
      ).toThrow("invalid Plugin Generation events");
    }
  );

  it("accepts partial Desired identity on a rejected Generation event", () => {
    expect(
      decodePluginInventory({
        ...demoPluginInventory,
        cursor: "1",
        events: [
          {
            cursor: "1",
            detail: "selected Profile did not resolve",
            pluginRootRevision: "demo-root",
            status: "rejected",
          },
        ],
      }).events[0]
    ).toMatchObject({
      pluginRootRevision: "demo-root",
      status: "rejected",
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

  it.each([
    ["a local-only key", "agent"],
    ["a mismatched package prefix", "example.other/agent"],
    ["a nested local key", "lenso.agent.loop/nested/agent"],
  ])("rejects %s in resolved Plugin selections", (_label, instanceKey) => {
    const [selection] = demoPluginInventory.active.plugins;
    expect(selection).toBeDefined();
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        active: {
          ...demoPluginInventory.active,
          plugins: [{ ...selection, instanceKey }],
        },
      })
    ).toThrow("invalid active Plugin state");
  });

  it("rejects duplicate resolved and managed Instance identities", () => {
    const [selection] = demoPluginInventory.active.plugins;
    const [managedPlugin] = demoPluginManagement.plugins;
    const [managedInstance] = managedPlugin?.instances ?? [];
    expect(selection).toBeDefined();
    expect(managedPlugin).toBeDefined();
    expect(managedInstance).toBeDefined();

    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        active: {
          ...demoPluginInventory.active,
          plugins: [selection, selection],
        },
      })
    ).toThrow("invalid active Plugin state");
    expect(() =>
      decodePluginManagement({
        ...demoPluginManagement,
        plugins: [
          {
            ...managedPlugin,
            instances: [managedInstance, managedInstance],
          },
        ],
      })
    ).toThrow("invalid managed Plugin entries");
    expect(() =>
      decodePluginManagement({
        ...demoPluginManagement,
        plugins: [managedPlugin, managedPlugin],
      })
    ).toThrow("invalid managed Plugin entries");
  });

  it("rejects empty optional Generation evidence", () => {
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        cursor: "1",
        events: [{ cursor: "1", detail: "", status: "rejected" }],
      })
    ).toThrow("invalid Plugin Generation events");
    expect(() =>
      decodePluginInventory({
        ...demoPluginInventory,
        preparing: {
          ...demoPluginInventory.desired,
          generationSpecDigest: "",
        },
      })
    ).toThrow("invalid preparing Plugin state");
  });

  it("decodes revision-fenced configuration preview and publication receipts", () => {
    const proposal = decodePluginConfigurationProposal({
      application: "app_generation",
      baseRevision: "sha256:root-active",
      baseSourceDigest: "sha256:source-active",
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
      baseSourceDigest: proposal.baseSourceDigest,
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
      streamId: demoPluginInventory.streamId,
    });

    expect(publication.operation.status).toBe("accepted");
    expect(publication.operation.streamId).toBe(demoPluginInventory.streamId);
    expect(publication.desired.configurationStatus).toBe("pending");
  });

  it.each([
    {
      application: "blocked",
      candidateRevision: "sha256:root-next",
      diagnostics: [{ code: "blocked", detail: "review required" }],
      status: "ready",
    },
    {
      application: "noop",
      candidateRevision: "sha256:root-next",
      diagnostics: [],
      status: "ready",
    },
    {
      application: "app_generation",
      candidateRevision: "sha256:root-active",
      diagnostics: [],
      status: "ready",
    },
    {
      application: "app_generation",
      candidateRevision: "sha256:root-next",
      diagnostics: [{ code: "notice", detail: "not actually ready" }],
      status: "ready",
    },
    {
      application: "blocked",
      candidateRevision: "sha256:root-active",
      diagnostics: [],
      status: "needs_decision",
    },
    {
      application: "blocked",
      candidateRevision: "sha256:root-active",
      diagnostics: [{ code: "", detail: "" }],
      status: "rejected",
    },
  ])("rejects impossible configuration proposal semantics %#", (change) => {
    expect(() =>
      decodePluginConfigurationProposal({
        application: change.application,
        baseRevision: "sha256:root-active",
        baseSourceDigest: "sha256:source-active",
        candidateRevision: change.candidateRevision,
        configurationAuthority: demoPluginManagement.configurationAuthority,
        diagnostics: change.diagnostics,
        instanceKey: "agent",
        pluginId: "lenso.agent.loop",
        proposalDigest: "sha256:proposal",
        schema: "lenso.plugin-configuration-proposal.v1",
        status: change.status,
      })
    ).toThrow("configuration proposal");
  });

  it("accepts a blocked proposal only with an actionable diagnostic", () => {
    expect(
      decodePluginConfigurationProposal({
        application: "blocked",
        baseRevision: "sha256:root-active",
        baseSourceDigest: "sha256:source-active",
        candidateRevision: "sha256:root-active",
        configurationAuthority: demoPluginManagement.configurationAuthority,
        diagnostics: [{ code: "needs_choice", detail: "select a Provider" }],
        instanceKey: "agent",
        pluginId: "lenso.agent.loop",
        proposalDigest: "sha256:proposal",
        schema: "lenso.plugin-configuration-proposal.v1",
        status: "needs_decision",
      }).status
    ).toBe("needs_decision");
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
        baseSourceDigest: "sha256:demo-agent-source",
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
        baseSourceDigest: "sha256:source-active",
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
        streamId: demoPluginInventory.streamId,
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
