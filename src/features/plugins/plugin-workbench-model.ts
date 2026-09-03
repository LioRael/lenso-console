import {
  assertPluginInventoryPage,
  type ManagedPluginInstance,
  type PluginConfigurationHistory,
  type PluginInventory,
  type PluginManagement,
  type PluginSelectionItem,
} from "./plugin-control-contract";

export type PluginWorkbenchItem = {
  active: PluginSelectionItem | null;
  configurationDefaults: import("./plugin-control-contract").JsonObject;
  configurationSchema: import("./plugin-control-contract").JsonObject | null;
  desired: PluginSelectionItem | null;
  instanceKey: string;
  management: ManagedPluginInstance | null;
  packageId: string;
  packageRevision: string;
  preparing: PluginSelectionItem | null;
  rootSupplied: boolean;
};

export const demoPluginInventory: PluginInventory = {
  active: {
    generationSpecDigest: "demo-generation",
    planDigest: "demo-plan",
    pluginRootRevision: "demo-root",
    plugins: [
      {
        disableable: false,
        entrypoint: "default",
        executionClass: "lenso.native-rust@1",
        instanceKey: "lenso.agent.loop/agent",
        packageId: "lenso.agent.loop",
        packageRevision: "linked",
        providedCapabilities: ["lenso.agent@1"],
        requiredCapabilities: ["lenso.agent.model@1", "lenso.agent.session@1"],
      },
    ],
  },
  appliedRevision: "demo-root",
  configurationAuthority: {
    kind: "sqlite_configuration_store",
    publicationHistory: true,
    reference: "agent",
    rollbackProposals: true,
  },
  configurationStatus: "applied",
  cursor: "0",
  desired: {
    desiredStateDigest: "demo-desired-state",
    planDigest: "demo-plan",
    pluginRootRevision: "demo-root",
    plugins: [
      {
        disableable: false,
        entrypoint: "default",
        executionClass: "lenso.native-rust@1",
        instanceKey: "lenso.agent.loop/agent",
        packageId: "lenso.agent.loop",
        packageRevision: "linked",
        providedCapabilities: ["lenso.agent@1"],
        requiredCapabilities: ["lenso.agent.model@1", "lenso.agent.session@1"],
      },
    ],
  },
  desiredRevision: "demo-root",
  events: [],
  preparing: null,
  schema: "lenso.agent.plugin-inventory.v2",
  streamId: "018f0f5f-8b8a-7c3e-9b34-7f7f8d3f6b20",
  truncated: false,
};

export const demoPluginManagement: PluginManagement = {
  configurationAuthority: {
    kind: "sqlite_configuration_store",
    publicationHistory: true,
    reference: "agent",
    rollbackProposals: true,
  },
  plugins: [
    {
      configurationDefaults: {
        max_steps: 12,
        model: "gpt-5.6-luna",
      },
      configurationSchema: {
        additionalProperties: false,
        properties: {
          max_steps: {
            description: "Maximum tool and reasoning steps for one turn.",
            maximum: 64,
            minimum: 1,
            type: "integer",
          },
          model: {
            description: "Model used by this Agent loop.",
            type: "string",
          },
        },
        required: ["model", "max_steps"],
        type: "object",
      },
      instances: [
        {
          disableable: false,
          hasRootDifference: false,
          instanceKey: "agent",
          origin: "host-default",
          rootConfigurationToml: null,
          selection: "enabled",
          sourceDigest: "sha256:demo-agent-source",
        },
      ],
      packageId: "lenso.agent.loop",
      packageRevision: "linked",
      rootSupplied: false,
    },
  ],
  revision: "demo-root",
  schema: "lenso.agent.plugin-management.v1",
  selectionAuthority: {
    kind: "sqlite_configuration_store",
    reference: "agent",
  },
};

export const demoPluginConfigurationHistory: PluginConfigurationHistory = {
  configurationAuthority: demoPluginManagement.configurationAuthority,
  instanceKey: "agent",
  pluginId: "lenso.agent.loop",
  publications: [
    {
      baseRevision: "demo-root-previous",
      baseSourceDigest: "sha256:demo-agent-source-previous",
      configurationToml: 'model = "gpt-5.6-luna"\nmax_steps = 9\n',
      proposalDigest: "demo-proposal-current",
      publishedAtUnixMs: 1_788_000_000_000,
      revision: demoPluginManagement.revision,
      rollbackOfProposalDigest: null,
    },
    {
      baseRevision: "demo-root-original",
      baseSourceDigest: null,
      configurationToml: 'model = "gpt-5.6-luna"\nmax_steps = 7\n',
      proposalDigest: "demo-proposal-previous",
      publishedAtUnixMs: 1_787_900_000_000,
      revision: "demo-root-previous",
      rollbackOfProposalDigest: null,
    },
  ],
  schema: "lenso.agent.plugin-configuration-history.v1",
};

export function mergePluginInventory(
  previous: PluginInventory | undefined,
  current: PluginInventory
): PluginInventory {
  if (!previous || current.streamId !== previous.streamId) {
    assertPluginInventoryPage(current);
    return current;
  }
  if (compareCursor(current.cursor, previous.cursor) < 0) {
    throw new TypeError(
      "Agent Host regressed the Plugin cursor within one event stream"
    );
  }
  assertPluginInventoryPage(current, previous.cursor);
  const eventsByCursor = new Map(
    [...previous.events, ...current.events].map((event) => [
      event.cursor,
      event,
    ])
  );
  const events = [...eventsByCursor.values()].sort((left, right) =>
    compareCursor(left.cursor, right.cursor)
  );
  return {
    ...current,
    events: events.slice(-64),
    truncated: previous.truncated || current.truncated || events.length > 64,
  };
}

export function pluginManagementNeedsRefresh(
  previousRevision: string | null,
  currentRevision: string
) {
  return previousRevision !== null && previousRevision !== currentRevision;
}

export function pluginAuthoringIsReady(
  managementRevision: string,
  desiredRevision: string,
  hasQueryError: boolean
) {
  return !hasQueryError && managementRevision === desiredRevision;
}

export function pluginWorkbenchItems(
  inventory: PluginInventory,
  management: PluginManagement
): readonly PluginWorkbenchItem[] {
  const active = selectionMap(inventory.active.plugins);
  const desired = selectionMap(inventory.desired.plugins);
  const preparing = selectionMap(inventory.preparing?.plugins ?? []);
  const managed = new Map<string, ManagedPluginInstance>();
  const packageDetails = new Map<
    string,
    {
      configurationDefaults: import("./plugin-control-contract").JsonObject;
      configurationSchema:
        | import("./plugin-control-contract").JsonObject
        | null;
      packageRevision: string;
      rootSupplied: boolean;
    }
  >();
  for (const plugin of management.plugins) {
    packageDetails.set(plugin.packageId, {
      configurationDefaults: plugin.configurationDefaults,
      configurationSchema: plugin.configurationSchema,
      packageRevision: plugin.packageRevision,
      rootSupplied: plugin.rootSupplied,
    });
    for (const instance of plugin.instances) {
      managed.set(`${plugin.packageId}/${instance.instanceKey}`, instance);
    }
  }
  const keys = new Set([
    ...active.keys(),
    ...desired.keys(),
    ...managed.keys(),
    ...preparing.keys(),
  ]);
  return [...keys]
    .map((key) => {
      const selection =
        active.get(key) ?? desired.get(key) ?? preparing.get(key) ?? null;
      const { instanceKey, packageId } = splitInstanceKey(key);
      const details = packageDetails.get(packageId);
      return {
        active: active.get(key) ?? null,
        configurationDefaults: details?.configurationDefaults ?? {},
        configurationSchema: details?.configurationSchema ?? null,
        desired: desired.get(key) ?? null,
        instanceKey,
        management: managed.get(key) ?? null,
        packageId,
        packageRevision:
          selection?.packageRevision ?? details?.packageRevision ?? "",
        preparing: preparing.get(key) ?? null,
        rootSupplied: details?.rootSupplied ?? false,
      } satisfies PluginWorkbenchItem;
    })
    .sort((left, right) => pluginKey(left).localeCompare(pluginKey(right)));
}

export function pluginKey(plugin: { instanceKey: string; packageId: string }) {
  return `${plugin.packageId}/${plugin.instanceKey}`;
}

export function stablePluginSelectionKey(
  currentKey: string | null,
  plugins: readonly PluginWorkbenchItem[]
) {
  if (
    currentKey !== null &&
    plugins.some((plugin) => pluginKey(plugin) === currentKey)
  ) {
    return currentKey;
  }
  const [first] = plugins;
  return first ? pluginKey(first) : null;
}

export function reconcilePluginSelectionKey(
  currentKey: string | null,
  verifiedPlugins: readonly PluginWorkbenchItem[] | undefined
) {
  return verifiedPlugins === undefined
    ? currentKey
    : stablePluginSelectionKey(currentKey, verifiedPlugins);
}

function compareCursor(left: string, right: string) {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function selectionMap(plugins: readonly PluginSelectionItem[]) {
  return new Map(plugins.map((plugin) => [plugin.instanceKey, plugin]));
}

function splitInstanceKey(key: string) {
  const separator = key.indexOf("/");
  if (separator < 1 || separator === key.length - 1) {
    throw new TypeError(
      `Agent Host returned invalid Plugin Instance key \`${key}\``
    );
  }
  return {
    instanceKey: key.slice(separator + 1),
    packageId: key.slice(0, separator),
  };
}

export type {
  PluginConfigurationAuthority,
  PluginConfigurationHistory,
  PluginConfigurationProposal,
  PluginConfigurationRollbackProposal,
  ManagedPluginInstance,
  PluginGenerationEvent,
  PluginInventory,
  PluginManagement,
  PluginSelectionItem,
} from "./plugin-control-contract";
