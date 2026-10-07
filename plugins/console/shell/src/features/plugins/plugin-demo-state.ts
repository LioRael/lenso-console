import {
  demoPluginInventory,
  demoPluginManagement,
} from "./plugin-workbench-model";

// Explicit preview data; never used by API mode or as a failed-connection fallback.
export function demoPluginState(appId: string) {
  const inventory = structuredClone(demoPluginInventory);
  const management = structuredClone(demoPluginManagement);
  if (inventory.configurationAuthority) {
    inventory.configurationAuthority.reference = appId;
  }
  management.configurationAuthority.reference = appId;
  if (management.selectionAuthority) {
    management.selectionAuthority.reference = appId;
  }
  if (appId === "support") {
    for (const selection of [inventory.active, inventory.desired]) {
      selection.plugins = selection.plugins.map((plugin) => ({
        ...plugin,
        instanceKey: "example.support.tickets/default",
        packageId: "example.support.tickets",
        providedCapabilities: ["example.support.ticketing@1"],
        requiredCapabilities: [],
      }));
    }
    management.plugins = management.plugins.map((plugin) => ({
      ...plugin,
      packageId: "example.support.tickets",
      configurationDefaults: { ticket_prefix: "SUP" },
      configurationSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ticket_prefix: {
            type: "string",
            description: "Prefix used for new support tickets.",
          },
        },
      },
      instances: plugin.instances.map((instance) => ({
        ...instance,
        instanceKey: "default",
      })),
    }));
  }
  return { inventory, management };
}
