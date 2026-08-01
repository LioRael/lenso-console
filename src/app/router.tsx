import { RuntimeStoriesPage } from "@lenso/story-console";
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import type { FunctionComponent } from "react";

import type { ConsoleModule } from "../../packages/console-package-api/src/index";
import { RuntimeConsoleProvider } from "../components/runtime/runtime-console-context";
import { RuntimeConsoleShell } from "../components/runtime/runtime-console-shell";
import { ChangesPage } from "../features/changes/changes-page";
import { DeliveryPage } from "../features/delivery/delivery-page";
import { HomePage } from "../features/home/home-page";
import { ModulesPage } from "../features/modules/modules-page";
import { RuntimePage } from "../features/runtime/runtime-page";
import { SettingsPage } from "../features/settings/settings-page";
import { SystemPage } from "../features/system/system-page";
import { ConsoleAppearanceProvider } from "./console-appearance";
import { HostConsoleLocaleProvider } from "./console-locale";
import { buildConsoleRoutes, consoleModules } from "./console-modules";

export const rootRedirectPath = "/";
export const runtimeConsoleBasePath = consoleBasePathFromBaseUrl(
  import.meta.env.BASE_URL
);

export function consoleBasePathFromBaseUrl(baseUrl: string) {
  const basePath = baseUrl.replace(/\/+$/, "");
  if (!basePath) {
    return "/";
  }
  return basePath.startsWith("/") ? basePath : `/${basePath}`;
}

export function createRuntimeConsoleRouter(
  modules: ConsoleModule[],
  { basepath = runtimeConsoleBasePath } = {}
) {
  const rootRoute = createRootRoute({
    component: () => (
      <ConsoleAppearanceProvider>
        <HostConsoleLocaleProvider>
          <RuntimeConsoleProvider>
            <RuntimeConsoleShell>
              <Outlet />
            </RuntimeConsoleShell>
          </RuntimeConsoleProvider>
        </HostConsoleLocaleProvider>
      </ConsoleAppearanceProvider>
    ),
  });

  const page = (path: string, component: FunctionComponent) =>
    createRoute({ component, getParentRoute: () => rootRoute, path });
  const legacy = (path: string, to: string) =>
    createRoute({
      beforeLoad: () => {
        throw redirect({ to });
      },
      getParentRoute: () => rootRoute,
      path,
    });

  const consoleRouteNodes = buildConsoleRoutes(modules)
    .filter((route) => route.moduleId !== "lenso/platform-story")
    .map((route) => page(route.path, route.component));

  const routeTree = rootRoute.addChildren([
    page("/", HomePage),
    page("/system", SystemPage),
    page("/modules", ModulesPage),
    page("/changes", ChangesPage),
    page("/runtime", RuntimePage),
    page("/stories", RuntimeStoriesPage),
    page("/delivery", DeliveryPage),
    page("/settings", SettingsPage),
    ...consoleRouteNodes,
    legacy("/launchpad", "/"),
    legacy("/overview", "/runtime"),
    legacy("/operations", "/runtime"),
    legacy("/operations/queues", "/runtime"),
    legacy("/operations/dead-letters", "/runtime"),
    legacy("/operations/functions", "/runtime"),
    legacy("/operations/remote-calls", "/runtime"),
    legacy("/operations/admin-actions", "/changes"),
    legacy("/services", "/runtime"),
    legacy("/data", "/modules"),
    legacy("/config", "/settings"),
    legacy("/runtime/stories", "/stories"),
  ]);

  return createRouter({ basepath, routeTree });
}

export const router = createRuntimeConsoleRouter(consoleModules);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
