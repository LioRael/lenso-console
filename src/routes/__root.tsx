import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/roboto-mono/400.css";
import "@lenso/tokens/styles.css";
import "@lenso/ui/preflight.css";
import "@lenso/ui/styles.css";
import "../styles.css";

import "../app/console-host-api";
import { HostConsoleLocaleProvider } from "../app/console-locale";
import { Providers } from "../app/providers";
import { RouteError, RouteNotFound } from "../app/route-states";
import { ConsoleProvider } from "../components/runtime/console-context";
import { ConsoleShell } from "../components/runtime/console-shell";
import { consoleDevConfig } from "../dev/console-dev-config";
import { ConsoleDevOverlay } from "../dev/console-dev-overlay";

const consoleLayerStyle = `@layer console-reset, console-base, priority1, priority2, priority3, priority4, priority5, priority6, priority7, priority8, priority9;`;

const RootComponent = () => (
  <Providers>
    <HostConsoleLocaleProvider>
      <ConsoleProvider>
        <ConsoleShell>
          <Outlet />
        </ConsoleShell>
      </ConsoleProvider>
    </HostConsoleLocaleProvider>
    <ConsoleDevOverlay config={consoleDevConfig} />
  </Providers>
);

const RootDocument = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <head>
      <HeadContent />
      <style>{consoleLayerStyle}</style>
      {import.meta.env.DEV ? (
        <>
          <link
            href="/virtual:stylex.css"
            rel="stylesheet"
            suppressHydrationWarning
          />
          <script type="module" src="/@id/virtual:stylex:runtime" />
        </>
      ) : null}
    </head>
    <body>
      <div id="root">{children}</div>
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRoute({
  errorComponent: RouteError,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0",
      },
      {
        name: "description",
        content:
          "Lenso Console is the independent system plane for operating the services in one Lenso System.",
      },
      { title: "Lenso Console" },
    ],
    links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  }),
  component: RootComponent,
  notFoundComponent: RouteNotFound,
  shellComponent: RootDocument,
});
