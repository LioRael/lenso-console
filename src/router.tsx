import { createRouter } from "@tanstack/react-router";

import { consoleBasePath } from "./app/console-router-config";
import { RouteError, RouteNotFound, RoutePending } from "./app/route-states";
import { routeTree } from "./routeTree.gen";

export {
  consoleBasePath,
  consoleBasePathFromBaseUrl,
  rootRedirectPath,
} from "./app/console-router-config";

/**
 * TanStack Start creates a fresh router for each server request and client
 * hydration. The generated file route tree is the application routing seam.
 */
export function getRouter() {
  return createRouter({
    basepath: consoleBasePath,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
    defaultPendingComponent: RoutePending,
    defaultPendingMinMs: 500,
    defaultPendingMs: 1000,
    defaultPreload: "intent",
    defaultPreloadDelay: 100,
    notFoundMode: "root",
    routeTree,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
