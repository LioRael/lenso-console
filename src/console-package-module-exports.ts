import { authConsoleManifest, authConsoleModule } from "@lenso/auth-console";
import {
  identityConsoleManifest,
  identityConsoleModule,
} from "@lenso/identity-console";
import {
  remoteCrmConsoleManifest,
  remoteCrmConsoleModule,
} from "@lenso/remote-crm-console";
import { storyConsoleManifest, storyConsoleModule } from "@lenso/story-console";
import {
  systemRegistryConsoleManifest,
  systemRegistryConsoleModule,
} from "@lenso/system-registry-console";

import {
  consolePackageKey,
  type ConsolePackageModuleExportsByKey,
} from "./app/console-package-registry";

export const consolePackageModuleExportsByKey = {
  [consolePackageKey(authConsoleManifest)]: authConsoleModule,
  [consolePackageKey(identityConsoleManifest)]: identityConsoleModule,
  [consolePackageKey(remoteCrmConsoleManifest)]: remoteCrmConsoleModule,
  [consolePackageKey(storyConsoleManifest)]: storyConsoleModule,
  // oxfmt-ignore
  [consolePackageKey(systemRegistryConsoleManifest)]: systemRegistryConsoleModule,
} satisfies ConsolePackageModuleExportsByKey;
