import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/roboto-mono/400.css";

import { loadConsoleBundlePackages } from "./app/console-bundles";
import { registerRuntimeConsoleModuleMetadata } from "./app/console-module-metadata";
import { consoleModules } from "./app/console-modules";
import { Providers } from "./app/providers";
import { createRuntimeConsoleRouter } from "./app/router";
import { registerRuntimeConsolePackages } from "./console-package-installs";
import { consoleDevConfig } from "./dev/console-dev-config";
import { ConsoleDevOverlay } from "./dev/console-dev-overlay";

import "./styles.css";

void startConsole();

async function startConsole() {
  const bundlePackages = consoleDevConfig.registryUrl
    ? await loadConsoleBundlePackages(consoleDevConfig.registryUrl).catch(
        (error: unknown) => {
          console.warn("Console development bundle loading failed", error);
          return [];
        }
      )
    : [];
  registerRuntimeConsolePackages(bundlePackages);
  registerRuntimeConsoleModuleMetadata(bundlePackages);
  const router = createRuntimeConsoleRouter([
    ...consoleModules,
    ...bundlePackages.map((item) => item.module),
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
