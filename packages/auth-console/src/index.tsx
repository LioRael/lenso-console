import { defineConsoleModule } from "@lenso/runtime-console-api";

import { authConsoleManifest } from "./manifest";
import { AuthConsolePage } from "./page";

export const authConsoleModule = defineConsoleModule({
  id: authConsoleManifest.id,
  surfaces: [
    {
      area: authConsoleManifest.area,
      component: AuthConsolePage,
      icon: authConsoleManifest.icon,
      label: authConsoleManifest.label,
      navigation: authConsoleManifest.navigation,
      path: authConsoleManifest.route,
    },
  ],
});

export { authConsoleManifest } from "./manifest";
export { AuthConsolePage } from "./page";
