import {
  RouterProvider,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { consoleHttpPaths } from "../src/http-paths";
import { Route } from "./browser-root";
import { PreviewShell } from "./preview-shell";
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
