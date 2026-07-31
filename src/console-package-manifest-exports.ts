import { identityConsoleManifest } from "@lenso/identity-console";
import { remoteCrmConsoleManifest } from "@lenso/remote-crm-console";
import { storyConsoleManifest } from "@lenso/story-console";
import { systemRegistryConsoleManifest } from "@lenso/system-registry-console";

export const consolePackageManifests = [
  identityConsoleManifest,
  remoteCrmConsoleManifest,
  storyConsoleManifest,
  systemRegistryConsoleManifest,
] as const;

export const consolePackageNames = consolePackageManifests.map(
  (manifest) => manifest.packageName
);
