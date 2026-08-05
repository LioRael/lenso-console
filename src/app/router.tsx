import type { ConsoleModule } from "@lenso/console-ui";
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import type { FunctionComponent } from "react";

import { ConsoleProvider } from "../components/runtime/console-context";
import { ConsoleShell } from "../components/runtime/console-shell";
import { ConsoleAppearanceProvider } from "./console-appearance";
import { HostConsoleLocaleProvider } from "./console-locale";
import { buildConsoleRoutes, consoleModules } from "./console-modules";
import { DynamicConsoleModulePage } from "./dynamic-console-module";

export const rootRedirectPath = "/";
export const consoleBasePath = consoleBasePathFromBaseUrl(
  import.meta.env.BASE_URL
);

export function consoleBasePathFromBaseUrl(baseUrl: string) {
  const basePath = baseUrl.replace(/\/+$/, "");
  if (!basePath) {
    return "/";
  }
  return basePath.startsWith("/") ? basePath : `/${basePath}`;
}

export function createConsoleRouter(
  modules: ConsoleModule[],
  { basepath = consoleBasePath } = {}
) {
  const rootRoute = createRootRoute({
    component: () => (
      <ConsoleAppearanceProvider>
        <HostConsoleLocaleProvider>
          <ConsoleProvider>
            <ConsoleShell>
              <Outlet />
            </ConsoleShell>
          </ConsoleProvider>
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

  const consoleRouteNodes = buildConsoleRoutes(modules).map((route) =>
    page(route.path, route.component)
  );

  const routeTree = rootRoute.addChildren([
    ...consoleRouteNodes,
    page("$", DynamicConsoleModulePage),
    legacy("/launchpad", "/"),
    legacy("/overview", "/runtime"),
    legacy("/operations", "/runtime"),
    legacy("/operations/queues", "/runtime"),
    legacy("/operations/dead-letters", "/runtime"),
    legacy("/operations/functions", "/runtime"),
    legacy("/operations/remote-calls", "/runtime"),
    legacy("/operations/admin-actions", "/changes"),
    legacy("/data", "/modules"),
    legacy("/config", "/settings"),
  ]);

  return createRouter({ basepath, routeTree });
}

export const router = createConsoleRouter(consoleModules);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
