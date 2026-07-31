import { defineConsolePackageManifest } from "@lenso/console-package-api";

import consoleSurface from "../console-surface.json";

const contract = consoleSurface as unknown as {
  readonly area: "operations";
  readonly exportName: "systemRegistryConsoleModule";
  readonly icon: "network";
  readonly id: "lenso/system-registry";
  readonly label: "Managed Services";
  readonly navigation: {
    readonly order: 70;
    readonly workspace: {
      readonly icon: "shield";
      readonly id: "system";
      readonly label: "System";
    };
  };
  readonly packageName: "@lenso/system-registry-console";
  readonly requiredCapabilities: readonly ["console.system-registry.read"];
  readonly route: "/system/services";
  readonly source: "first_party";
  readonly surfaceName: "managed-services";
  readonly version: "workspace";
};

export const systemRegistryConsoleManifest =
  defineConsolePackageManifest(contract);
