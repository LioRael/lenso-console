import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import type { FunctionComponent } from "react";

import type { ConsoleModule } from "../../packages/console-ui-internal/src/index";
import { RuntimeConsoleProvider } from "../components/runtime/runtime-console-context";
import { ConsoleShell } from "../components/runtime/runtime-console-shell";
import { ConsoleAppearanceProvider } from "./console-appearance";
import { HostConsoleLocaleProvider } from "./console-locale";
import { buildConsoleRoutes, consoleModules } from "./console-modules";
import { IsolatedConsoleModulePage } from "./isolated-console-module";

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
            <ConsoleShell>
              <Outlet />
            </ConsoleShell>
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

  const consoleRouteNodes = buildConsoleRoutes(modules).map((route) =>
    page(route.path, route.component)
  );

  const routeTree = rootRoute.addChildren([
    ...consoleRouteNodes,
    page("$", IsolatedConsoleModulePage),
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
  ]);

  return createRouter({ basepath, routeTree });
}

export const router = createRuntimeConsoleRouter(consoleModules);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
