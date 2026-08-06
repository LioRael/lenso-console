import { RouterProvider } from "@tanstack/react-router";
import React, * as ReactRuntime from "react";
import ReactDOM from "react-dom/client";
import * as ReactJsxRuntime from "react/jsx-runtime";

import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/roboto-mono/400.css";

import "./app/console-host-api";
import { consoleRuntimeModules } from "./app/console-modules";
import { applyGlobalStyles } from "./app/global-styles";
import { Providers } from "./app/providers";
import { createConsoleRouter } from "./app/router";
import { consoleDevConfig } from "./dev/console-dev-config";
import { ConsoleDevOverlay } from "./dev/console-dev-overlay";

import "./styles.css";

applyGlobalStyles();

const consoleRuntime = globalThis as Record<string, unknown>;
consoleRuntime.__LENSO_CONSOLE_REACT_RUNTIME__ = ReactRuntime;
consoleRuntime.__LENSO_CONSOLE_REACT_JSX_RUNTIME__ = ReactJsxRuntime;

void startConsole();

async function startConsole() {
  const router = createConsoleRouter(consoleRuntimeModules);

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Providers>
        <RouterProvider router={router} />
        <ConsoleDevOverlay config={consoleDevConfig} />
      </Providers>
    </React.StrictMode>
  );
}
