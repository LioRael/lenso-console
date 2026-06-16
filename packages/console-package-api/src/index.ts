import type {
  ConsoleNavigationMetadata,
  ConsoleSurfaceArea,
  ConsoleSurfaceIcon,
} from "../../../src/app/console-module-api";
import type { ConsolePackageRegistrySource } from "../../../src/app/console-package-registry";

export {
  defineConsoleModule,
  type ConsoleModule,
  type ConsoleModuleSurface,
  type ConsoleNavigationGroup,
  type ConsoleNavigationItem,
  type ConsoleNavigationMetadata,
  type ConsoleRouteContribution,
  type ConsoleSurfaceArea,
  type ConsoleSurfaceIcon,
  type ConsoleWorkspaceRef,
} from "../../../src/app/console-module-api";
export {
  runtimeConsoleHostApi,
  type RuntimeConsoleHostApi,
  type ConsoleAdminListResponse,
  type ConsoleAdminRecord,
  type ExecutionInspectorTab,
  type ExecutionNode,
  type RuntimeStory,
  type StoryViewMode,
} from "../../../src/app/console-host-api";

export interface ConsolePackageSurfaceManifest {
  surfaceName: string;
  label: string;
  area: ConsoleSurfaceArea;
  route: string;
  requiredCapabilities: readonly string[];
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

export interface ConsolePackageManifestBase {
  id: string;
  packageName: string;
  exportName: string;
  source: ConsolePackageRegistrySource;
  version?: string;
}

export type ConsolePackageManifest =
  | (ConsolePackageManifestBase & ConsolePackageSurfaceManifest)
  | (ConsolePackageManifestBase & {
      surfaces: readonly ConsolePackageSurfaceManifest[];
    });

export interface ConsoleSurfaceManifest {
  name: string;
  label: string;
  area: ConsoleSurfaceArea;
  route: string;
  package: {
    name: string;
    export: string;
  };
  required_capabilities: readonly string[];
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

export const defineConsolePackageManifest = <
  Manifest extends ConsolePackageManifest,
>(
  manifest: Manifest
): Manifest => manifest;

const packageManifestSurfaces = (
  manifest: ConsolePackageManifest
): readonly ConsolePackageSurfaceManifest[] => {
  if ("surfaces" in manifest) {
    return manifest.surfaces;
  }
  return [manifest];
};

export const consoleSurfacesFromPackageManifest = (
  manifest: ConsolePackageManifest
): ConsoleSurfaceManifest[] =>
  packageManifestSurfaces(manifest).map((packageSurface) => {
    const surface: ConsoleSurfaceManifest = {
      area: packageSurface.area,
      label: packageSurface.label,
      name: packageSurface.surfaceName,
      package: {
        export: manifest.exportName,
        name: manifest.packageName,
      },
      required_capabilities: packageSurface.requiredCapabilities,
      route: packageSurface.route,
    };
    if (packageSurface.icon) {
      surface.icon = packageSurface.icon;
    }
    if (packageSurface.navigation) {
      surface.navigation = packageSurface.navigation;
    }
    return surface;
  });

export const consoleSurfaceFromPackageManifest = (
  manifest: ConsolePackageManifest
): ConsoleSurfaceManifest => {
  const [surface] = consoleSurfacesFromPackageManifest(manifest);
  if (!surface) {
    throw new Error(
      `Console package manifest declares no surfaces: ${manifest.id}`
    );
  }
  return surface;
};
