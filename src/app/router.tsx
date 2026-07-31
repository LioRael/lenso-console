import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import type { ConsoleModule } from "../../packages/console-package-api/src/index";
import { RuntimeConsoleProvider } from "../components/runtime/runtime-console-context";
import { RuntimeConsoleShell } from "../components/runtime/runtime-console-shell";
import { AdminActionsPage } from "../pages/admin-actions-page";
import { ConfigPage } from "../pages/config-page";
import { DataPage } from "../pages/data-page";
import { DeadLettersPage } from "../pages/dead-letters-page";
import { FunctionsPage } from "../pages/functions-page";
import { LaunchpadPage } from "../pages/launchpad-page";
import { ModulesPage } from "../pages/modules-page";
import { OperationsPage } from "../pages/operations-page";
import { OverviewPage } from "../pages/overview-page";
import { QueuesPage } from "../pages/queues-page";
import { RemoteProxyCallsPage } from "../pages/remote-proxy-calls-page";
import { ServicesPage } from "../pages/services-page";
import { buildConsoleRoutes, consoleModules } from "./console-modules";

export const rootRedirectPath = "/launchpad";
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
      <RuntimeConsoleProvider>
        <RuntimeConsoleShell>
          <Outlet />
        </RuntimeConsoleShell>
      </RuntimeConsoleProvider>
    ),
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: () => {
      throw redirect({ to: rootRedirectPath });
    },
  });

  const consoleRouteNodes = buildConsoleRoutes(modules).map((route) =>
    createRoute({
      component: route.component,
      getParentRoute: () => rootRoute,
      path: route.path,
    })
  );

  const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/overview",
    component: OverviewPage,
  });

  const launchpadRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/launchpad",
    component: LaunchpadPage,
  });

  const operationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/operations",
    beforeLoad: () => {
      throw redirect({ to: "/operations/queues" });
    },
  });

  const operationsQueuesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/operations/queues",
    component: () => (
      <OperationsPage active="queues">
        <QueuesPage />
      </OperationsPage>
    ),
  });

  const operationsDeadLettersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/operations/dead-letters",
    component: () => (
      <OperationsPage active="dead-letters">
        <DeadLettersPage />
      </OperationsPage>
    ),
  });

  const operationsFunctionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/operations/functions",
    component: () => (
      <OperationsPage active="functions">
        <FunctionsPage />
      </OperationsPage>
    ),
  });

  const operationsRemoteCallsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/operations/remote-calls",
    component: () => (
      <OperationsPage active="remote-calls">
        <RemoteProxyCallsPage />
      </OperationsPage>
    ),
  });

  const operationsAdminActionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/operations/admin-actions",
    component: () => (
      <OperationsPage active="admin-actions">
        <AdminActionsPage />
      </OperationsPage>
    ),
  });

  const configRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/config",
    component: ConfigPage,
  });

  const dataRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/data",
    component: DataPage,
  });

  const modulesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/modules",
    component: ModulesPage,
  });

  const servicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services",
    component: ServicesPage,
  });

  const routeTree = rootRoute.addChildren([
    indexRoute,
    ...consoleRouteNodes,
    launchpadRoute,
    overviewRoute,
    operationsRoute,
    operationsQueuesRoute,
    operationsDeadLettersRoute,
    operationsFunctionsRoute,
    operationsRemoteCallsRoute,
    operationsAdminActionsRoute,
    servicesRoute,
    modulesRoute,
    configRoute,
    dataRoute,
  ]);

  return createRouter({ basepath, routeTree });
}

export const router = createRuntimeConsoleRouter(consoleModules);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
