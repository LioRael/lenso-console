import { describe, expect, it } from "vitest";

import type { PluginOperation } from "./plugin-operation";
import {
  configurationProposalReadyPresentation,
  configurationChangeCanSubmit,
  configurationPublicationIsCurrent,
  desiredSelectionChecked,
  generationStatusPresentation,
  pluginStatusPresentation,
  pluginTechnicalSelection,
  rollbackProposalReadyPresentation,
} from "./plugin-runtime-state";
import {
  demoPluginInventory,
  demoPluginManagement,
  pluginWorkbenchItems,
  type PluginInventory,
} from "./plugin-workbench-model";

const operation: PluginOperation = {
  acceptedAfterCursor: "0",
  cursor: "0",
  desiredStateDigest: "demo-desired-state",
  generationSpecDigest: "demo-generation",
  id: "operation-1",
  planDigest: "demo-plan",
  pluginRootRevision: "demo-root",
  status: "preparing",
  streamId: demoPluginInventory.streamId,
};

describe("Plugin runtime presentation", () => {
  it("describes a ready no-op without promising a new Generation", () => {
    expect(
      configurationProposalReadyPresentation(
        {
          application: "noop",
          baseRevision: "demo-root",
          baseSourceDigest: "sha256:demo-agent-source",
          candidateRevision: "demo-root",
          configurationAuthority: demoPluginManagement.configurationAuthority,
          diagnostics: [],
          instanceKey: "agent",
          pluginId: "lenso.agent.loop",
          proposalDigest: "demo-proposal",
          schema: "lenso.plugin-configuration-proposal.v1",
          status: "ready",
        },
        "demo-root"
      )
    ).toEqual({
      actionLabel: "Confirm configuration",
      description:
        "Preview ready. The resolved App Generation does not change, so publication can apply immediately.",
    });
  });

  it("describes a no-op rollback as an immediate publication", () => {
    expect(
      rollbackProposalReadyPresentation(
        {
          application: "noop",
          baseRevision: "demo-root",
          baseSourceDigest: "sha256:demo-agent-source",
          candidateRevision: "demo-root",
          configurationAuthority: demoPluginManagement.configurationAuthority,
          diagnostics: [],
          instanceKey: "agent",
          pluginId: "lenso.agent.loop",
          proposalDigest: "demo-rollback-proposal",
          schema: "lenso.plugin-configuration-proposal.v1",
          status: "ready",
        },
        "demo-root"
      )
    ).toEqual({
      actionLabel: "Confirm rollback",
      description:
        "Rollback review ready. The resolved App Generation does not change, so publication can apply immediately.",
    });
  });

  it("allows a reviewed no-op rollback even when TOML matches the Host", () => {
    const proposal = {
      application: "noop",
      baseRevision: "demo-root",
      baseSourceDigest: "sha256:demo-agent-source",
      candidateRevision: "demo-root",
      configurationAuthority: demoPluginManagement.configurationAuthority,
      diagnostics: [],
      instanceKey: "agent",
      pluginId: "lenso.agent.loop",
      proposalDigest: "demo-rollback-proposal",
      schema: "lenso.plugin-configuration-proposal.v1",
      status: "ready",
    } as const;

    expect(configurationChangeCanSubmit(undefined, "same", "same")).toBe(false);
    expect(configurationChangeCanSubmit(proposal, "same", "same")).toBe(true);
  });

  it("identifies the current publication by exact source bytes", () => {
    expect(configurationPublicationIsCurrent("mode = 1\n", "mode = 1\n")).toBe(
      true
    );
    expect(configurationPublicationIsCurrent("mode=1\n", "mode = 1\n")).toBe(
      false
    );
    expect(configurationPublicationIsCurrent("", null)).toBe(false);
  });

  it("labels an Instance Active only with active Generation evidence", () => {
    const item = firstItem(demoPluginInventory);

    expect(
      pluginStatusPresentation({
        inventory: demoPluginInventory,
        item,
        mutation: undefined,
        operation: null,
      })
    ).toMatchObject({ label: "Active", tone: "success" });
  });

  it.each([
    ["pending", "Updating", "info"],
    ["rejected", "Desired rejected", "error"],
  ] as const)(
    "keeps the serving revision truthful while a desired upgrade is %s",
    (configurationStatus, label, tone) => {
      const [active] = demoPluginInventory.active.plugins;
      if (!active) {
        throw new TypeError("demo Plugin selection is missing");
      }
      const inventory: PluginInventory = {
        ...demoPluginInventory,
        configurationStatus,
        desired: {
          ...demoPluginInventory.desired,
          planDigest: "desired-plan-v2",
          pluginRootRevision: "desired-root-v2",
          plugins: [
            {
              ...active,
              packageRevision: "2.0.0",
            },
          ],
        },
        desiredRevision: "desired-root-v2",
      };
      const item = firstItem(inventory);

      expect(item.packageRevision).toBe(active.packageRevision);
      expect(
        pluginStatusPresentation({
          inventory,
          item,
          mutation: undefined,
          operation: null,
        })
      ).toMatchObject({ label, tone });
    }
  );

  it("labels desired-only state as pending activation", () => {
    const inventory: PluginInventory = {
      ...demoPluginInventory,
      active: { ...demoPluginInventory.active, plugins: [] },
    };
    const item = firstItem(inventory);

    expect(
      pluginStatusPresentation({
        inventory,
        item,
        mutation: undefined,
        operation: null,
      })
    ).toMatchObject({ label: "Pending activation", tone: "info" });
    expect(pluginTechnicalSelection(item)).toMatchObject({ phase: "Desired" });
  });

  it("labels a rejected desired-only addition as rejected", () => {
    const inventory: PluginInventory = {
      ...demoPluginInventory,
      active: { ...demoPluginInventory.active, plugins: [] },
      configurationStatus: "rejected",
    };

    expect(
      pluginStatusPresentation({
        inventory,
        item: firstItem(inventory),
        mutation: undefined,
        operation: null,
      })
    ).toMatchObject({ label: "Activation rejected", tone: "error" });
  });

  it("labels a rejected active-only removal as rejected", () => {
    const inventory: PluginInventory = {
      ...demoPluginInventory,
      configurationStatus: "rejected",
      desired: { ...demoPluginInventory.desired, plugins: [] },
    };

    expect(
      pluginStatusPresentation({
        inventory,
        item: firstItem(inventory),
        mutation: undefined,
        operation: null,
      })
    ).toMatchObject({ label: "Removal rejected", tone: "error" });
  });

  it("labels a candidate-only Instance as preparing", () => {
    const inventory: PluginInventory = {
      ...demoPluginInventory,
      active: { ...demoPluginInventory.active, plugins: [] },
      preparing: {
        ...demoPluginInventory.desired,
        generationSpecDigest: "candidate-generation",
      },
    };
    const item = firstItem(inventory);

    expect(pluginTechnicalSelection(item)).toMatchObject({
      phase: "Candidate",
    });

    expect(
      pluginStatusPresentation({
        inventory,
        item,
        mutation: undefined,
        operation: null,
      })
    ).toMatchObject({ label: "Preparing", tone: "info" });
  });

  it("does not present an immediately rejected selection as desired", () => {
    const item = firstItem({
      ...demoPluginInventory,
      desired: { ...demoPluginInventory.desired, plugins: [] },
    });
    const mutation = {
      enabled: true,
      expectedStreamId: demoPluginInventory.streamId,
      instanceKey: "agent",
      packageId: "lenso.agent.loop",
      type: "select" as const,
    };

    expect(
      desiredSelectionChecked({
        inventory: demoPluginInventory,
        item,
        mutation,
        operation: { ...operation, status: "rejected" },
      })
    ).toBe(false);
    expect(
      desiredSelectionChecked({
        inventory: demoPluginInventory,
        item,
        mutation,
        operation,
      })
    ).toBe(true);
  });

  it("keeps a targeted accepted operation in Preparing state", () => {
    const item = firstItem(demoPluginInventory);

    expect(
      pluginStatusPresentation({
        inventory: demoPluginInventory,
        item,
        mutation: {
          enabled: false,
          expectedStreamId: demoPluginInventory.streamId,
          instanceKey: "agent",
          packageId: "lenso.agent.loop",
          type: "select",
        },
        operation,
      })
    ).toMatchObject({ label: "Preparing", tone: "info" });
  });

  it.each([
    ["rejected", "Rejected", "error"],
    ["rolled_back", "Rolled back", "warning"],
  ] as const)(
    "renders %s as an explicit terminal failure",
    (status, label, tone) => {
      const item = firstItem(demoPluginInventory);

      expect(
        pluginStatusPresentation({
          inventory: demoPluginInventory,
          item,
          mutation: {
            expectedRevision: "sha256:root-active",
            expectedSourceDigest: "sha256:demo-agent-source",
            expectedStreamId: demoPluginInventory.streamId,
            instanceKey: "agent",
            packageId: "lenso.agent.loop",
            proposalDigest: "sha256:proposal",
            toml: "mode = 'safe'",
            type: "configure",
          },
          operation: { ...operation, detail: "Ready-Gate failed", status },
        })
      ).toMatchObject({ description: "Ready-Gate failed", label, tone });
    }
  );

  it("shows the latest non-destructive failure until a later switch", () => {
    const failed: PluginInventory = {
      ...demoPluginInventory,
      configurationStatus: "rejected",
      cursor: "3",
      events: [
        {
          cursor: "2",
          detail: "prepare failed",
          pluginRootRevision: "demo-root",
          status: "rejected",
        },
      ],
    };
    expect(
      generationStatusPresentation({ inventory: failed, operation: null })
    ).toMatchObject({ label: "Generation rejected", tone: "error" });

    expect(
      generationStatusPresentation({
        inventory: {
          ...failed,
          configurationStatus: "applied",
          cursor: "4",
          events: [
            ...failed.events,
            {
              cursor: "4",
              desiredStateDigest: "demo-desired-state",
              generationSpecDigest: "demo-generation-next",
              planDigest: "demo-plan",
              pluginRootRevision: "demo-root",
              previousGenerationSpecDigest: "demo-generation",
              routingEpoch: "4",
              status: "switched",
            },
          ],
        },
        operation: null,
      })
    ).toMatchObject({ label: "Generation active", tone: "success" });
  });

  it("lets applied active truth supersede a same-root partial rejection", () => {
    expect(
      generationStatusPresentation({
        inventory: {
          ...demoPluginInventory,
          cursor: "1",
          events: [
            {
              cursor: "1",
              detail: "an alternate same-root desired state was rejected",
              pluginRootRevision: demoPluginInventory.desiredRevision,
              status: "rejected",
            },
          ],
        },
        operation: null,
      })
    ).toMatchObject({ label: "Generation active", tone: "success" });
  });

  it("uses configuration status when no lifecycle event proves an outcome", () => {
    expect(
      generationStatusPresentation({
        inventory: {
          ...demoPluginInventory,
          configurationStatus: "pending",
          desiredRevision: "sha256:root-next",
          desired: {
            ...demoPluginInventory.desired,
            pluginRootRevision: "sha256:root-next",
          },
        },
        operation: null,
      })
    ).toMatchObject({ label: "Configuration pending", tone: "info" });

    expect(
      generationStatusPresentation({
        inventory: {
          ...demoPluginInventory,
          configurationStatus: "rejected",
          desiredRevision: "sha256:root-rejected",
        },
        operation: null,
      })
    ).toMatchObject({ label: "Configuration rejected", tone: "error" });
  });

  it("does not claim a pending outcome when the retained event window is incomplete", () => {
    expect(
      generationStatusPresentation({
        inventory: {
          ...demoPluginInventory,
          configurationStatus: "pending",
          desired: {
            ...demoPluginInventory.desired,
            planDigest: "sha256:desired-next",
            pluginRootRevision: "sha256:root-next",
          },
          desiredRevision: "sha256:root-next",
          truncated: true,
        },
        operation: null,
      })
    ).toMatchObject({ label: "Generation state incomplete", tone: "warning" });
  });

  it("does not present a failure from an older Plugin Root revision", () => {
    const inventory: PluginInventory = {
      ...demoPluginInventory,
      configurationStatus: "pending",
      desired: {
        ...demoPluginInventory.desired,
        pluginRootRevision: "sha256:root-next",
      },
      desiredRevision: "sha256:root-next",
      events: [
        {
          cursor: "1",
          detail: "old failure",
          pluginRootRevision: "sha256:root-old",
          status: "rejected",
        },
      ],
    };

    expect(
      generationStatusPresentation({ inventory, operation: null })
    ).toMatchObject({ label: "Configuration pending", tone: "info" });
  });

  it("associates a rollback with the revision that prepared its Generation", () => {
    const inventory: PluginInventory = {
      ...demoPluginInventory,
      configurationStatus: "pending",
      desired: {
        ...demoPluginInventory.desired,
        pluginRootRevision: "sha256:root-next",
      },
      desiredRevision: "sha256:root-next",
      events: [
        {
          cursor: "1",
          desiredStateDigest: "demo-desired-state",
          generationSpecDigest: "sha256:generation-next",
          planDigest: "demo-plan",
          pluginRootRevision: "sha256:root-next",
          previousGenerationSpecDigest: "demo-generation",
          status: "preparing",
        },
        {
          cursor: "2",
          detail: "candidate failed after switching",
          generationSpecDigest: "sha256:generation-next",
          restoredGenerationSpecDigest: "demo-generation",
          routingEpoch: "2",
          status: "rolled_back",
        },
      ],
    };

    expect(
      generationStatusPresentation({ inventory, operation: null })
    ).toMatchObject({ label: "Generation rolled back", tone: "warning" });
  });

  it("lets newer inventory truth supersede a terminal local operation", () => {
    const item = firstItem(demoPluginInventory);
    const mutation = {
      enabled: false,
      expectedStreamId: demoPluginInventory.streamId,
      instanceKey: "agent",
      packageId: "lenso.agent.loop",
      type: "select" as const,
    };

    expect(
      desiredSelectionChecked({
        inventory: demoPluginInventory,
        item,
        mutation,
        operation: { ...operation, status: "switched" },
      })
    ).toBe(true);
    expect(
      generationStatusPresentation({
        inventory: { ...demoPluginInventory, cursor: "2" },
        operation: {
          ...operation,
          cursor: "1",
          detail: "old failure",
          status: "rejected",
        },
      })
    ).toMatchObject({ label: "Generation active", tone: "success" });
  });

  it("lets a late inventory switch supersede a timed-out local operation", () => {
    expect(
      generationStatusPresentation({
        inventory: { ...demoPluginInventory, cursor: "2" },
        operation: { ...operation, cursor: "1", status: "preparing" },
      })
    ).toMatchObject({ label: "Generation active", tone: "success" });
  });

  it("lets a late inventory rejection supersede a timed-out local operation", () => {
    expect(
      generationStatusPresentation({
        inventory: {
          ...demoPluginInventory,
          configurationStatus: "rejected",
          cursor: "2",
          events: [
            {
              cursor: "2",
              detail: "late Ready-Gate failure",
              pluginRootRevision: "demo-root",
              status: "rejected",
            },
          ],
        },
        operation: { ...operation, cursor: "1", status: "preparing" },
      })
    ).toMatchObject({
      description: "late Ready-Gate failure",
      label: "Generation rejected",
      tone: "error",
    });
  });

  it("surfaces degraded Plugin watching when no higher-priority state exists", () => {
    expect(
      generationStatusPresentation({
        inventory: {
          ...demoPluginInventory,
          cursor: "1",
          events: [
            {
              cursor: "1",
              detail: "native watcher unavailable",
              status: "watch_degraded",
            },
          ],
        },
        operation: null,
      })
    ).toMatchObject({
      description: "native watcher unavailable",
      label: "Plugin watch degraded",
      tone: "warning",
    });
  });
});

function firstItem(inventory: PluginInventory) {
  const [item] = pluginWorkbenchItems(inventory, demoPluginManagement);
  if (!item) {
    throw new Error("demo Plugin is missing");
  }
  return item;
}
