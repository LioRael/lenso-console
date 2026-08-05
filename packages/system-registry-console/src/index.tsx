import { defineConsoleModule } from "@lenso/console-ui-internal";

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

export { SystemRegistryConsolePage } from "./page";
