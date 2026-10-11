import "@fontsource-variable/inter";
import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import "@lenso/console-dashboard/styles.css";
import "../../plugins/console/shell/src/styles.css";
import {
  ConsoleLayout,
  type ConsolePreferenceSnapshot,
  type ConsolePreferenceStore,
  type ConsoleRouterAdapter,
} from "@lenso/console-react";
import { Button } from "@lenso/ui/button";
import { Popover } from "@lenso/ui/popover";
import { Tooltip } from "@lenso/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { ComposedConsole } from "./composition";
import {
  createSampleAuth,
  createSampleDashboard,
  createSampleOrders,
  sampleCatalog,
} from "./sample-clients";

const DevelopmentFeedback = import.meta.env.DEV
  ? lazy(async () => {
      const { Agentation } = await import("agentation");
      return { default: Agentation };
    })
  : null;

const clients = {
  workforce: createSampleAuth("workforce"),
  customers: createSampleAuth("customers"),
  dashboard: createSampleDashboard(),
  orders: createSampleOrders(),
  catalog: sampleCatalog,
};
const session = { state: "ready", scopeKey: "local-sample-preview" } as const;
const preferenceKey = "lenso.composed-console.local-sample-preview.navigation";
const preferences: ConsolePreferenceStore = {
  async read() {
    const stored = localStorage.getItem(preferenceKey);
    return stored
      ? (JSON.parse(stored) as ConsolePreferenceSnapshot)
      : { revision: "0", value: null };
  },
  async save({ expectedRevision, value }, { signal } = {}) {
    return await navigator.locks.request(
      preferenceKey,
      signal ? { signal } : {},
      async () => {
        const current = await this.read();
        signal?.throwIfAborted();
        if (current.revision !== expectedRevision) {
          throw new Error("Preference revision conflict");
        }
        const snapshot = { revision: crypto.randomUUID(), value };
        localStorage.setItem(preferenceKey, JSON.stringify(snapshot));
        return snapshot;
      }
    );
  },
};
const confirmSampleArchive = async (ids: readonly string[]) =>
  // oxlint-disable-next-line no-alert -- Browser-owned confirmation is intentional in this local-only harness.
  window.confirm(
    `Archive ${ids.length} sample orders? No real orders will be changed.`
  );

export function matchRoute(pattern: string, pathname: string) {
  const route = pattern.split("/");
  const actual = pathname.split("/");
  if (route.length !== actual.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < route.length; index += 1) {
    const segment = route[index]!;
    const value = actual[index]!;
    if (segment.startsWith(":")) {
      if (!value) {
        return null;
      }
      try {
        params[segment.slice(1)] = decodeURIComponent(value);
      } catch {
        return null;
      }
    } else if (segment !== value) {
      return null;
    }
  }
  return params;
}

function Preview() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    const followLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || url.hash) {
        return;
      }
      event.preventDefault();
      window.history.pushState(null, "", url.pathname + url.search);
      update();
    };
    window.addEventListener("popstate", update);
    document.addEventListener("click", followLink);
    return () => {
      window.removeEventListener("popstate", update);
      document.removeEventListener("click", followLink);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
  const router: ConsoleRouterAdapter = {
    pathname,
    navigate(href) {
      window.history.pushState(null, "", href);
      setPathname(window.location.pathname);
    },
    match: matchRoute,
  };
  return (
    <Tooltip.Provider delay={150}>
      <ComposedConsole
        {...clients}
        router={router}
        session={session}
        preferences={preferences}
        confirmArchive={confirmSampleArchive}
      >
        <ConsoleLayout.Corner area="bottomLeft" xstyle={styles.previewCorner}>
          <aside
            aria-label="Local sample preview"
            {...stylex.props(styles.notice)}
          >
            <Popover.Root>
              <Popover.Trigger
                render={<Button variant="ghost">Sample preview</Button>}
              />
              <Popover.Portal>
                <Popover.Positioner side="top" sideOffset={8}>
                  <Popover.Popup aria-label="About sample preview">
                    Sample data only. Business changes stay in memory and reset
                    on reload. Dock preferences stay in this browser. No
                    backend, login or production access.
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <Button
                    variant="outline"
                    aria-pressed={dark}
                    onClick={() => setDark(!dark)}
                  />
                }
              >
                Dark theme
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="top" sideOffset={8}>
                  <Tooltip.Popup>
                    {dark ? "Use light theme" : "Use dark theme"}
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </aside>
        </ConsoleLayout.Corner>
      </ComposedConsole>
      {DevelopmentFeedback && (
        <Suspense fallback={null}>
          <DevelopmentFeedback
            className={stylex.props(styles.feedbackLayer).className ?? ""}
          />
        </Suspense>
      )}
    </Tooltip.Provider>
  );
}

const styles = stylex.create({
  feedbackLayer: {
    display: "block",
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 19,
    isolation: "isolate",
    pointerEvents: "none",
  },
  previewCorner: {
    marginBottom: { default: 0, "@media (max-width: 640px)": 64 },
  },
  notice: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    color: "var(--foreground)",
    backgroundColor: "var(--background)",
    fontSize: 12,
    borderRadius: 12,
  },
});

createRoot(document.getElementById("root")!).render(<Preview />);
