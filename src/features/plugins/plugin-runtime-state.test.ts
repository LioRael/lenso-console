import { describe, expect, it } from "vitest";

import type { PluginOperation } from "./plugin-operation";
import {
  configurationProposalReadyPresentation,
  desiredSelectionChecked,
  generationStatusPresentation,
  pluginStatusPresentation,
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
  id: "operation-1",
  planDigest: "demo-plan",
  pluginRootRevision: "demo-root",
  status: "preparing",
};

describe("Plugin runtime presentation", () => {
  it("describes a ready no-op without promising a new Generation", () => {
    expect(
      configurationProposalReadyPresentation(
        {
          application: "noop",
          baseRevision: "demo-root",
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
          cursor: "4",
          events: [
            ...failed.events,
            {
              cursor: "4",
              pluginRootRevision: "demo-root",
              status: "switched",
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
          generationSpecDigest: "sha256:generation-next",
          pluginRootRevision: "sha256:root-next",
          status: "preparing",
        },
        {
          cursor: "2",
          detail: "candidate failed after switching",
          generationSpecDigest: "sha256:generation-next",
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
