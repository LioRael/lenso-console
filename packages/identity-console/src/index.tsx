import { defineConsoleExtension } from "@lenso/console-package-api";

import { identityConsoleManifest } from "./manifest";
import { IdentityConsolePage } from "./page";

export const identityConsoleExtension = defineConsoleExtension({
  components: { identity: IdentityConsolePage },
  manifest: identityConsoleManifest,
});
export const identityConsoleModule = identityConsoleExtension.module;

export { identityConsoleManifest } from "./manifest";
export { IdentityConsolePage } from "./page";
