import { defineConsoleModule } from "@lenso/console-ui-internal";

import { SystemRegistryConsolePage } from "./page";

export const systemRegistryConsoleModule = defineConsoleModule({
  id: "lenso/system-registry",
  surfaces: [
    {
      area: "operations",
      component: SystemRegistryConsolePage,
      icon: "network",
      label: "Managed Services",
      localizedLabels: { "zh-CN": "托管服务" },
      navigation: {
        order: 70,
        workspace: {
          icon: "shield",
          id: "system",
          label: "System",
          localizedLabels: { "zh-CN": "系统" },
        },
      },
      path: "/system/services",
    },
  ],
});

export { SystemRegistryConsolePage } from "./page";
