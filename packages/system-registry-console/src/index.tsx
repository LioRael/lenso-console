import { defineConsoleManifest } from "@lenso/console-module-api";
import type { ConsoleModuleManifest } from "@lenso/console-module-api";
import { defineConsoleModule, defineConsoleUiModule } from "@lenso/console-ui";

import manifestDefinition from "../console-module.json";
import { SystemRegistryConsolePage } from "./page";

export const systemRegistryConsoleModule = defineConsoleModule({
  id: "lenso/system-registry",
  surfaces: [
    {
      area: "operations",
      component: SystemRegistryConsolePage,
      icon: "blocks",
      label: "Services",
      localizedLabels: { "zh-CN": "服务" },
      navigation: {
        order: 10,
        workspace: {
          icon: "shield",
          id: "system",
          label: "System",
          localizedLabels: { "zh-CN": "系统" },
        },
      },
      path: "/services",
    },
  ],
});

export const systemRegistryConsoleUiModule = defineConsoleUiModule({
  manifest: defineConsoleManifest(manifestDefinition as ConsoleModuleManifest),
  surfaces: { "managed-services": SystemRegistryConsolePage },
});

export default systemRegistryConsoleUiModule;

export { SystemRegistryConsolePage } from "./page";
