import { Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { isUiPreview, previewMounts } from "virtual:lenso-preview";
import "@fontsource-variable/inter";

import "@fontsource/roboto-mono/400.css";
import "@lenso/tokens/styles.css";
import "./shell/styles.css";
import { ConsoleAppearanceProvider } from "./shell/app/console-appearance";
import { HostConsoleLocaleProvider } from "./shell/app/console-locale";
import { ConsoleSession } from "./shell/app/console-session";
import { Providers } from "./shell/app/providers";
import { RouteError, RouteNotFound } from "./shell/app/route-states";
import { ConsoleShell } from "./shell/components/runtime/console-shell";
import { consoleDevConfig } from "./shell/dev/console-dev-config";
import { ConsoleDevOverlay } from "./shell/dev/console-dev-overlay";

function PreviewRoot() {
  return (
    <HostConsoleLocaleProvider>
      <ConsoleAppearanceProvider>
        <ConsoleSession>
          <Providers>
            <ConsoleShell>
              <PreviewOutlet />
            </ConsoleShell>
          </Providers>
        </ConsoleSession>
        <ConsoleDevOverlay config={consoleDevConfig} />
      </ConsoleAppearanceProvider>
    </HostConsoleLocaleProvider>
  );
}

function PreviewOutlet() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const page = previewMounts.some(
    (mount) =>
      pathname === mount.basePath ||
      pathname.startsWith(`${mount.basePath.replace(/\/$/, "")}/`)
  );
  if (
    isUiPreview &&
    pathname !== "/" &&
    !page &&
    !["/settings", "/settings/appearance"].includes(pathname)
  ) {
    return <RouteNotFound />;
  }
  return <Outlet />;
}

export const Route = createRootRoute({
  component: PreviewRoot,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});
