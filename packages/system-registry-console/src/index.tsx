import { defineConsoleExtension } from "@lenso/console-package-api";

import { systemRegistryConsoleManifest } from "./manifest";
import { SystemRegistryConsolePage } from "./page";

export const systemRegistryConsoleExtension = defineConsoleExtension({
  components: { "managed-services": SystemRegistryConsolePage },
  manifest: systemRegistryConsoleManifest,
});
export const systemRegistryConsoleModule =
  systemRegistryConsoleExtension.module;

export { systemRegistryConsoleManifest } from "./manifest";
export { SystemRegistryConsolePage } from "./page";
