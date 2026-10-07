import { Tooltip } from "@lenso/ui/tooltip";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { Agentation } from "agentation";
import { useEffect, useState, type ReactNode } from "react";

import { ConsoleAppearanceProvider } from "../app/console-appearance";
import "@fontsource-variable/inter";

import "@fontsource/roboto-mono/400.css";
import "@lenso/tokens/styles.css";
import "../styles.css";

import { HostConsoleLocaleProvider } from "../app/console-locale";
import { ConsoleSession } from "../app/console-session";
import { Providers } from "../app/providers";
import { RouteError, RouteNotFound } from "../app/route-states";
import { ConsoleShell } from "../components/runtime/console-shell";
import { consoleDevConfig } from "../dev/console-dev-config";
import { ConsoleDevOverlay } from "../dev/console-dev-overlay";
import { consoleShellPath } from "../lib/console-http-paths";

const consoleLayerStyle = `@layer console-reset, console-base, priority1, priority2, priority3, priority4, priority5, priority6, priority7, priority8, priority9;`;

const RootComponent = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return <output aria-busy="true" />;
  }

  return (
    <HostConsoleLocaleProvider>
      <ConsoleAppearanceProvider>
        <ConsoleSession>
          <Providers>
            <ConsoleShell>
              <Outlet />
            </ConsoleShell>
          </Providers>
        </ConsoleSession>
        <ConsoleDevOverlay config={consoleDevConfig} />
        {import.meta.env.DEV ? <Agentation /> : null}
      </ConsoleAppearanceProvider>
    </HostConsoleLocaleProvider>
  );
};

const RootDocument = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <head>
      <style href="lenso-console-layer-order" precedence="layer-order">
        {consoleLayerStyle}
      </style>
      <HeadContent />
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
      <Tooltip.Provider delay={150}>
        <div id="root">{children}</div>
      </Tooltip.Provider>
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
        content: "Local management and Agent workspace for one Lenso App.",
      },
      { title: "Lenso Console" },
    ],
    links: [
      {
        rel: "icon",
        href: consoleShellPath("/favicon.svg"),
        type: "image/svg+xml",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: RouteNotFound,
  shellComponent: RootDocument,
});
