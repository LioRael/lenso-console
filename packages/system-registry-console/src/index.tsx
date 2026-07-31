import { defineConsoleModule } from "@lenso/console-package-api";

import { systemRegistryConsoleManifest } from "./manifest";
import { SystemRegistryConsolePage } from "./page";

export const systemRegistryConsoleModule = defineConsoleModule({
  id: systemRegistryConsoleManifest.id,
  surfaces: [
    {
      area: systemRegistryConsoleManifest.area,
      component: SystemRegistryConsolePage,
      icon: systemRegistryConsoleManifest.icon,
      label: systemRegistryConsoleManifest.label,
      navigation: systemRegistryConsoleManifest.navigation,
      path: systemRegistryConsoleManifest.route,
    },
  ],
});

export { systemRegistryConsoleManifest } from "./manifest";
export { SystemRegistryConsolePage } from "./page";
