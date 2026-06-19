import { defineConsolePackageManifest } from "@lenso/runtime-console-api";

import consoleSurface from "../console-surface.json";

const consoleSurfaceContract = consoleSurface as unknown as {
  readonly area: "data";
  readonly exportName: "authConsoleModule";
  readonly icon: "shield";
  readonly id: "auth";
  readonly label: "Auth";
  readonly navigation: {
    readonly order: 50;
    readonly workspace: {
      readonly icon: "shield";
      readonly id: "auth";
      readonly label: "Auth";
    };
  };
  readonly packageName: "@lenso/auth-console";
  readonly requiredCapabilities: readonly ["auth.users.read"];
  readonly route: "/data/auth";
  readonly source: "installed";
  readonly surfaceName: "auth";
  readonly version: "workspace";
};

export const authConsoleManifest = defineConsolePackageManifest(
  consoleSurfaceContract
);
