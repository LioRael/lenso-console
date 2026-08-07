import { StartClient } from "@tanstack/react-start/client";
import React, * as ReactRuntime from "react";
import { hydrateRoot } from "react-dom/client";
import * as ReactJsxRuntime from "react/jsx-runtime";

import "./app/console-host-api";
import { applyGlobalStyles } from "./app/global-styles";

import "./styles.css";

const consoleRuntime = globalThis as Record<string, unknown>;
consoleRuntime.__LENSO_CONSOLE_REACT_RUNTIME__ = ReactRuntime;
consoleRuntime.__LENSO_CONSOLE_REACT_JSX_RUNTIME__ = ReactJsxRuntime;

applyGlobalStyles();

hydrateRoot(
  document,
  <React.StrictMode>
    <StartClient />
  </React.StrictMode>
);
