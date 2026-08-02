import {
  defineConsolePackageManifest,
  type ConsolePackageManifest,
  type ConsolePackageSurfaceManifest,
} from "@lenso/console-package-api";

import authConsoleSurface from "../console-surface.json";

type AuthConsolePackageManifest = Omit<
  ConsolePackageManifest,
  "surfaces" | "version"
> & {
  readonly surfaces: readonly ConsolePackageSurfaceManifest[];
  readonly version: "workspace";
};

export const authConsoleManifest = defineConsolePackageManifest(
  authConsoleSurface as unknown as AuthConsolePackageManifest
);
