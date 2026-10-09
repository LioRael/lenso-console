import {
  RouterProvider,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { Route } from "./browser-root";
import { PreviewShell } from "./preview-shell";
import { consoleHttpPaths } from "./shell/lib/console-http-paths";
import "virtual:stylex:runtime";

const page = createRoute({
  getParentRoute: () => Route,
  path: "$",
  component: PreviewShell,
});
const index = createRoute({
  getParentRoute: () => Route,
  path: "/",
  component: PreviewShell,
});
const router = createRouter({
  basepath: consoleHttpPaths.shell_base_path,
  routeTree: Route.addChildren([index, page]),
});

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
);
