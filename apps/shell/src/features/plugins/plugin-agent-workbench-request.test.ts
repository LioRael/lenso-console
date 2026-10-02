import { describe, expect, test } from "vitest";

import type { PluginWorkbenchRequest } from "./plugin-agent-workbench-context";
import { applyPluginWorkbenchRequest } from "./plugin-agent-workbench-request";
import { PluginConfigurationDraftStore } from "./plugin-configuration-draft";
import {
  demoPluginInventory,
  demoPluginManagement,
  pluginWorkbenchItems,
} from "./plugin-workbench-model";

const selectedKey = "lenso.agent.loop/agent";
const configurationToml = 'model = "gpt-5.6-luna"\nmax_steps = 12\n';

describe("Plugin Agent workbench requests", () => {
  test("imports an exact proposal only as a review draft", () => {
    const draftStore = new PluginConfigurationDraftStore();

    expect(
      applyPluginWorkbenchRequest({
        draftStore,
        items: pluginWorkbenchItems(demoPluginInventory, demoPluginManagement),
        managementRevision: demoPluginManagement.revision,
        request: proposalRequest(),
      })
    ).toEqual({
      notice:
        "Agent proposal imported as a draft. Preview it again in Console before publishing.",
      selectedKey,
    });
    expect(draftStore.get(selectedKey)).toMatchObject({
      dirty: true,
      value: configurationToml,
    });
  });

  test("marks stale proposals for a fresh authority preview", () => {
    const result = applyPluginWorkbenchRequest({
      draftStore: new PluginConfigurationDraftStore(),
      items: pluginWorkbenchItems(demoPluginInventory, demoPluginManagement),
      managementRevision: "sha256:new-management-revision",
      request: proposalRequest(),
    });

    expect(result?.notice).toContain("Host state changed");
    expect(result?.notice).toContain("current authority");
  });

  test("opens a publication without importing configuration", () => {
    const draftStore = new PluginConfigurationDraftStore();
    const request: PluginWorkbenchRequest = {
      agentId: "console",
      id: 2,
      instanceKey: "agent",
      packageId: "lenso.agent.loop",
    };

    expect(
      applyPluginWorkbenchRequest({
        draftStore,
        items: pluginWorkbenchItems(demoPluginInventory, demoPluginManagement),
        managementRevision: demoPluginManagement.revision,
        request,
      })
    ).toEqual({
      notice:
        "Showing lenso.agent.loop/agent after the Agent management action.",
      selectedKey,
    });
    expect(draftStore.get(selectedKey)).toBeUndefined();
  });

  test("selects the first matching Instance for a package inspection", () => {
    expect(
      applyPluginWorkbenchRequest({
        draftStore: new PluginConfigurationDraftStore(),
        items: pluginWorkbenchItems(demoPluginInventory, demoPluginManagement),
        managementRevision: demoPluginManagement.revision,
        request: {
          agentId: "console",
          id: 3,
          intent: "inspection",
          packageId: "lenso.agent.loop",
        },
      })
    ).toEqual({
      notice: "Showing lenso.agent.loop/agent from the Agent inspection.",
      selectedKey,
    });
  });

  test("rejects a draft handoff without an exact Instance", () => {
    const request = proposalRequest();
    delete request.instanceKey;

    expect(
      applyPluginWorkbenchRequest({
        draftStore: new PluginConfigurationDraftStore(),
        items: pluginWorkbenchItems(demoPluginInventory, demoPluginManagement),
        managementRevision: demoPluginManagement.revision,
        request,
      })
    ).toBeNull();
  });
});

function proposalRequest(): PluginWorkbenchRequest {
  return {
    agentId: "console",
    draftReview: {
      baseRevision: demoPluginManagement.revision,
      baseSourceDigest: "sha256:demo-agent-source",
      configurationToml,
      proposalDigest: "sha256:proposal",
    },
    id: 1,
    instanceKey: "agent",
    packageId: "lenso.agent.loop",
  };
}
