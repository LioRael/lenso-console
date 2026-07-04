import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";

import { registerRuntimeConsoleModuleMetadata } from "./app/console-module-metadata";
import { consoleModules } from "./app/console-modules";
import { Providers } from "./app/providers";
import { createRuntimeConsoleRouter } from "./app/router";
import { loadRuntimeConsoleBundlePackages } from "./app/runtime-console-bundles";
import { registerRuntimeConsolePackages } from "./console-package-installs";
import { consoleDevConfig } from "./dev/console-dev-config";
import { ConsoleDevOverlay } from "./dev/console-dev-overlay";

import "./styles.css";

void startRuntimeConsole();

async function startRuntimeConsole() {
  const runtimePackages = await loadRuntimeConsoleBundlePackages(
    consoleDevConfig.registryUrl
  ).catch((error: unknown) => {
    console.warn("Runtime console bundle loading failed", error);
    return [];
  });
  registerRuntimeConsolePackages(runtimePackages);
  registerRuntimeConsoleModuleMetadata(runtimePackages);
  const router = createRuntimeConsoleRouter([
    ...consoleModules,
    ...runtimePackages.map((item) => item.module),
  ]);

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Providers>
        <RouterProvider router={router} />
        <ConsoleDevOverlay config={consoleDevConfig} />
      </Providers>
    </React.StrictMode>
  );
}
