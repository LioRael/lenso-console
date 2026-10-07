import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { getRouter } from "./shell/router";
import "virtual:stylex:runtime";

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={getRouter()} />
);
