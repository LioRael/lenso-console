import { defineConsoleExtension } from "@lenso/console-package-api";

import { RemoteCrmCompaniesPage } from "./companies-page";
import { remoteCrmConsoleManifest } from "./manifest";
import { RemoteCrmConsolePage } from "./page";

export const remoteCrmConsoleExtension = defineConsoleExtension({
  components: { "remote-crm": RemoteCrmConsolePage },
  manifest: remoteCrmConsoleManifest,
});
const [contactsSurface] = remoteCrmConsoleExtension.module.surfaces;

if (!contactsSurface) {
  throw new Error("Remote CRM Console must register its contacts surface");
}
if (!contactsSurface.navigation) {
  throw new Error("Remote CRM Console contacts surface requires navigation");
}

const contactsNavigation = contactsSurface.navigation;

export const remoteCrmConsoleModule = {
  ...remoteCrmConsoleExtension.module,
  surfaces: [
    contactsSurface,
    {
      ...contactsSurface,
      component: RemoteCrmCompaniesPage,
      label: "Companies",
      navigation: {
        ...contactsNavigation,
        order: 80,
      },
      path: "/data/remote-crm/companies",
    },
  ],
};

export { remoteCrmConsoleManifest } from "./manifest";
export { RemoteCrmConsolePage } from "./page";
export { RemoteCrmCompaniesPage } from "./companies-page";
