import type {
  ConsoleModule,
  ConsoleNavigationItem,
  ConsoleRouteContribution,
  ConsoleSurfaceArea,
  ConsoleSurfaceIcon,
} from "@lenso/console-ui";

import { storyConsoleModule } from "../../packages/story-console/src/index";
import { systemRegistryConsoleModule } from "../../packages/system-registry-console/src/index";
import {
  consoleDevConfig,
  type ConsoleDevMode,
} from "../dev/console-dev-config";
import { ConsoleAccessPage } from "../features/access/access-page";
import { ChangesPage } from "../features/changes/changes-page";
import { DeliveryPage } from "../features/delivery/delivery-page";
import { HomePage } from "../features/home/home-page";
import { ModulesPage } from "../features/modules/modules-page";
import { PluginWorkbenchPage } from "../features/plugins/plugin-workbench-page";
import { RuntimePage } from "../features/runtime/runtime-page";
import { SettingsPage } from "../features/settings/settings-page";
import { SystemPage } from "../features/system/system-page";
import { SYSTEM_WORKSPACE } from "./console-workspace-navigation";

export { defineConsoleModule } from "@lenso/console-ui";
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
} from "@lenso/console-ui";

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

export function findConsoleRoute(
  path: string,
  routes: readonly ConsoleRouteContribution[]
): ConsoleRouteContribution | undefined {
  return routes.find((route) => route.path === path);
}

const CONSOLE_OWNED_LINKED_MODULES = new Set([
  "lenso/system-registry",
  "lenso/platform-story",
]);

export function isConsoleOwnedLinkedRoute(
  route: ConsoleRouteContribution | undefined
): route is ConsoleRouteContribution {
  return Boolean(route && CONSOLE_OWNED_LINKED_MODULES.has(route.moduleId));
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
    workbenchSurface("house", "Overview", "概览", "/", HomePage, 0),
    workbenchSurface(
      "blocks",
      "Plugins",
      "插件",
      "/plugins",
      PluginWorkbenchPage,
      30
    ),
    workbenchSurface("boxes", "Surfaces", "界面", "/modules", ModulesPage, 35),
    workbenchSurface(
      "settings",
      "Settings",
      "设置",
      "/settings",
      SettingsPage,
      80
    ),
  ],
};

const consoleUtilityModule: ConsoleModule = {
  id: "lenso/console-workbench-utility",
  surfaces: [
    workbenchSurface(
      "shield",
      "Console Access",
      "Console Access",
      "/access",
      ConsoleAccessPage,
      10
    ),
    workbenchSurface("server-cog", "System", "系统", "/system", SystemPage, 20),
    workbenchSurface(
      "git-compare-arrows",
      "Changes",
      "变更",
      "/changes",
      ChangesPage,
      40
    ),
    workbenchSurface(
      "activity",
      "Operations",
      "运行操作",
      "/runtime",
      RuntimePage,
      50
    ),
    workbenchSurface(
      "rocket",
      "Releases",
      "发布",
      "/delivery",
      DeliveryPage,
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

/**
 * These declarations provide the primary navigation and mock route preview.
 * In API mode, Module UI route components are still loaded only from the
 * receipt-bound ESM artifact selected by DynamicConsoleModulePage.
 */
export const consoleModules = [
  consoleWorkbenchModule,
  systemRegistryConsoleModule,
  storyConsoleModule,
];

export function consoleModulesForDevMode(
  mode: ConsoleDevMode
): ConsoleModule[] {
  void mode;
  return consoleModules;
}

/**
 * The seeded mock host has no artifact registry to discover Module UI from.
 * Keep the local preview useful by linking the two workspace modules only in
 * that mode; API and production builds continue to use receipt-bound ESM.
 */
export const consoleRuntimeModules = [
  ...consoleModulesForDevMode(consoleDevConfig.mode),
  consoleUtilityModule,
];

export const consoleRoutes = buildConsoleRoutes(consoleRuntimeModules);
// The Shell keeps only host-owned primary items statically. System-owned
// Services and Stories are supplied by useConsoleNavigation so their presence
// can follow the current System Connection projection.
export const consoleNavigation = buildConsoleNavigation([
  consoleWorkbenchModule,
]);
