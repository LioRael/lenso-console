import { StartClient } from "@tanstack/react-start/client";
import React from "react";
import { hydrateRoot } from "react-dom/client";

hydrateRoot(
  document,
  <React.StrictMode>
    <StartClient />
  </React.StrictMode>
);
