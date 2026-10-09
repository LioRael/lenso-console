import { Tooltip } from "@lenso/ui/tooltip";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import "@fontsource-variable/inter";

import "@fontsource/roboto-mono/400.css";
import "@lenso/tokens/styles.css";
import "./shell/styles.css";
import { ConsoleAppearanceProvider } from "./shell/app/console-appearance";

function PreviewRoot() {
  return (
    <ConsoleAppearanceProvider>
      <Tooltip.Provider delay={150}>
        <Outlet />
      </Tooltip.Provider>
    </ConsoleAppearanceProvider>
  );
}

export const Route = createRootRoute({
  component: PreviewRoot,
  errorComponent: () => <p role="alert">The preview page could not render.</p>,
  notFoundComponent: () => <p>Preview page not found.</p>,
});
