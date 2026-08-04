import type {
  ConsoleModule,
  ConsoleNavigationItem,
  ConsoleRouteContribution,
  ConsoleSurfaceArea,
  ConsoleSurfaceIcon,
} from "@lenso/console-ui-internal";
import { storyConsoleModule } from "@lenso/story-console";
import { systemRegistryConsoleModule } from "@lenso/system-registry-console";

import { ChangesPage } from "../features/changes/changes-page";
import { DeliveryPage } from "../features/delivery/delivery-page";
import { HomePage } from "../features/home/home-page";
import { ModulesPage } from "../features/modules/modules-page";
import { RuntimePage } from "../features/runtime/runtime-page";
import { SettingsPage } from "../features/settings/settings-page";
import { SystemPage } from "../features/system/system-page";
import { SYSTEM_WORKSPACE } from "./console-workspace-navigation";

export { defineConsoleModule } from "@lenso/console-ui-internal";
export type {
  ConsoleModule,
  ConsoleNavigationItem,
  ConsoleNavigationMetadata,
  ConsoleNavigationGroup,
  ConsoleRouteContribution,
  ConsoleSurfaceArea,
  ConsoleSurfaceIcon,
  ConsoleWorkspaceRef,
  ConsoleModuleSurface,
} from "@lenso/console-ui-internal";

export function buildConsoleRoutes(
  modules: ConsoleModule[]
): ConsoleRouteContribution[] {
  const seenPaths = new Set<string>();
  const routes: ConsoleRouteContribution[] = [];

  for (const module of modules) {
    for (const surface of module.surfaces) {
      if (seenPaths.has(surface.path)) {
        throw new Error(`Duplicate console module route: ${surface.path}`);
      }
      seenPaths.add(surface.path);
      routes.push({
        ...surface,
        moduleId: module.id,
      });
    }
  }

  return routes;
}

export function buildConsoleNavigation(
  modules: ConsoleModule[]
): ConsoleNavigationItem[] {
  return buildConsoleRoutes(modules).map((route) => {
    const item: ConsoleNavigationItem = {
      label: route.label,
      moduleId: route.moduleId,
      path: route.path,
    };
    if (route.localizedLabels) {
      item.localizedLabels = route.localizedLabels;
    }
    if (route.icon) {
      item.icon = route.icon;
    }
    item.navigation =
      route.navigation ?? defaultSystemNavigationForArea(route.area);
    return item;
  });
}

export function selectDefaultConsoleRoute(
  routes: ConsoleRouteContribution[]
): ConsoleRouteContribution {
  const [route] = routes;
  if (!route) {
    throw new Error("No console module routes are registered");
  }
  return route;
}

const DEFAULT_SYSTEM_NAVIGATION_ORDER = {
  runtime: 50,
  operations: 80,
  data: 100,
  configuration: 120,
} satisfies Record<ConsoleSurfaceArea, number>;

function defaultSystemNavigationForArea(area: ConsoleSurfaceArea) {
  return {
    order: defaultSystemNavigationOrder(area),
    workspace: SYSTEM_WORKSPACE,
  };
}

function defaultSystemNavigationOrder(area: ConsoleSurfaceArea): number {
  return DEFAULT_SYSTEM_NAVIGATION_ORDER[area];
}

const consoleWorkbenchModule: ConsoleModule = {
  id: "lenso/console-workbench",
  surfaces: [
    workbenchSurface("house", "Home", "首页", "/", HomePage, 0),
    workbenchSurface("server-cog", "System", "系统", "/system", SystemPage, 10),
    workbenchSurface("boxes", "Modules", "模块", "/modules", ModulesPage, 20),
    workbenchSurface(
      "git-compare-arrows",
      "Changes",
      "变更",
      "/changes",
      ChangesPage,
      30
    ),
    workbenchSurface(
      "activity",
      "Runtime",
      "运行时",
      "/runtime",
      RuntimePage,
      40
    ),
    workbenchSurface(
      "rocket",
      "Delivery",
      "交付",
      "/delivery",
      DeliveryPage,
      60
    ),
    workbenchSurface(
      "settings",
      "Settings",
      "设置",
      "/settings",
      SettingsPage,
      70
    ),
  ],
};

function workbenchSurface(
  icon: ConsoleSurfaceIcon,
  label: string,
  localizedLabel: string,
  path: string,
  component: ConsoleModule["surfaces"][number]["component"],
  order: number
): ConsoleModule["surfaces"][number] {
  return {
    area: "operations",
    component,
    icon,
    label,
    localizedLabels: { "zh-CN": localizedLabel },
    navigation: { order, workspace: SYSTEM_WORKSPACE },
    path,
  };
}

export const consoleModules = [
  consoleWorkbenchModule,
  storyConsoleModule,
  systemRegistryConsoleModule,
];

export const consoleRoutes = buildConsoleRoutes(consoleModules);
export const consoleNavigation = buildConsoleNavigation(consoleModules);
