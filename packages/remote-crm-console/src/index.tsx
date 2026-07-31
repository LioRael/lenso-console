import { defineConsoleExtension } from "@lenso/console-package-api";

import { remoteCrmConsoleManifest } from "./manifest";
import { RemoteCrmConsolePage } from "./page";

export const remoteCrmConsoleExtension = defineConsoleExtension({
  components: { "remote-crm": RemoteCrmConsolePage },
  manifest: remoteCrmConsoleManifest,
});
export const remoteCrmConsoleModule = remoteCrmConsoleExtension.module;

export { remoteCrmConsoleManifest } from "./manifest";
export { RemoteCrmConsolePage } from "./page";
