import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/roboto-mono/400.css";

import { consoleModules } from "./app/console-modules";
import { Providers } from "./app/providers";
import { createRuntimeConsoleRouter } from "./app/router";
import { consoleDevConfig } from "./dev/console-dev-config";
import { ConsoleDevOverlay } from "./dev/console-dev-overlay";

import "./styles.css";

void startConsole();

async function startConsole() {
  const router = createRuntimeConsoleRouter(consoleModules);

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Providers>
        <RouterProvider router={router} />
        <ConsoleDevOverlay config={consoleDevConfig} />
      </Providers>
    </React.StrictMode>
  );
}
