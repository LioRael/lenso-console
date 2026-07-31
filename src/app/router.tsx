import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { ModuleUiPage } from "./module-ui-page";
import { SystemHome, SystemShell } from "./system-shell";

export const rootRedirectPath = "/";
export const consoleBasePath = basePathFromViteBase(import.meta.env.BASE_URL);

export function basePathFromViteBase(baseUrl: string) {
  const basePath = baseUrl.replace(/\/+$/, "");
  if (!basePath) {
    return "/";
  }
  return basePath.startsWith("/") ? basePath : `/${basePath}`;
}

export function createConsoleRouter({ basepath = consoleBasePath } = {}) {
  const rootRoute = createRootRoute({ component: SystemShell });
  const indexRoute = createRoute({
    component: SystemHome,
    getParentRoute: () => rootRoute,
    path: "/",
  });
  const moduleUiRoute = createRoute({
    component: ModuleUiPage,
    getParentRoute: () => rootRoute,
    path: "/module-ui/$moduleId/$entryName",
  });
  return createRouter({
    basepath,
    routeTree: rootRoute.addChildren([indexRoute, moduleUiRoute]),
  });
}

export const router = createConsoleRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
