import "@fontsource-variable/inter";
import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import "@lenso/console-dashboard/styles.css";
import "@lenso/console-plugin-manager/styles.css";
import "@lenso/auth-console/styles.css";
import "../../plugins/console/shell/src/styles.css";
import type {
  ConsolePreferenceSnapshot,
  ConsolePreferenceStore,
  ConsoleRouterAdapter,
} from "@lenso/console-react";
import { Tooltip } from "@lenso/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { previewAgentServices } from "./agent-preview";
import { ComposedConsole } from "./composition";
import { bindReviewPages, ReviewLogin, ReviewNotice } from "./review-pages";
import {
  createReviewAdministration,
  createReviewOAuth,
  createReviewWorkspaceServices,
} from "./review-samples";
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

function PreviewFeedback() {
  useEffect(() => {
    let frame = 0;
    const place = () => {
      frame = 0;
      // Reserve the expanded Agentation footprint, even when its entry button is collapsed.
      const width = 337;
      const height = 44;
      const obstacles = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [role="combobox"], [role="dialog"], [data-dashboard-dock-surface]'
        )
      )
        .filter(
          (element) =>
            !element.closest("[data-agentation-portal], [inert]") &&
            element.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            })
        )
        .map((element) => element.getBoundingClientRect());
      const candidates = [
        { right: 16, bottom: 96 },
        {
          right: (window.innerWidth - width) / 2,
          bottom: window.innerHeight - 60,
        },
      ];
      for (let bottom = 16; bottom <= window.innerHeight - 60; bottom += 52) {
        candidates.push(
          { right: 16, bottom },
          { right: window.innerWidth - width - 16, bottom }
        );
      }
      const score = ({ right, bottom }: { right: number; bottom: number }) => {
        const left = window.innerWidth - right - width;
        const top = window.innerHeight - bottom - height;
        return obstacles.reduce(
          (total, rect) =>
            total +
            Math.max(
              0,
              Math.min(left + width + 8, rect.right) -
                Math.max(left - 8, rect.left)
            ) *
              Math.max(
                0,
                Math.min(top + height + 8, rect.bottom) -
                  Math.max(top - 8, rect.top)
              ),
          0
        );
      };
      const next = candidates.reduce((best, candidate) =>
        score(candidate) < score(best) ? candidate : best
      );
      document.documentElement.style.setProperty(
        "--preview-feedback-right",
        `${next.right}px`
      );
      document.documentElement.style.setProperty(
        "--preview-feedback-bottom",
        `${next.bottom}px`
      );
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(place);
      }
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "inert", "open"],
    });
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      document.documentElement.style.removeProperty("--preview-feedback-right");
      document.documentElement.style.removeProperty(
        "--preview-feedback-bottom"
      );
    };
  }, []);
  if (!DevelopmentFeedback) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <DevelopmentFeedback
        className={stylex.props(styles.feedbackToolbar).className ?? ""}
      />
    </Suspense>
  );
}

const clients = {
  workforce: createSampleAuth("workforce"),
  customers: createSampleAuth("customers"),
  dashboard: createSampleDashboard(),
  orders: createSampleOrders(),
  catalog: sampleCatalog,
};
const session = { state: "ready", scopeKey: "local-sample-preview" } as const;
function navigate(href: string) {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
const agent = previewAgentServices(
  new URLSearchParams(window.location.search).get("agent") === "replay",
  () => navigate("/agent-connections")
);
const reviewPlugins = [
  bindReviewPages({
    administration: createReviewAdministration(),
    oauth: createReviewOAuth(),
    workspace: createReviewWorkspaceServices(),
    navigate,
  }),
];
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
    const theme = new URLSearchParams(window.location.search).get("theme");
    const selectedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = selectedTheme;
    document.documentElement.style.colorScheme = selectedTheme;
  }, []);
  const router: ConsoleRouterAdapter = {
    pathname,
    navigate,
    match: matchRoute,
  };
  const loginState = pathname.startsWith("/review/auth/")
    ? pathname.slice("/review/auth/".length)
    : null;
  return (
    <Tooltip.Provider delay={150}>
      {loginState ? (
        <ReviewLogin state={loginState} navigate={navigate} />
      ) : (
        <ComposedConsole
          {...clients}
          router={router}
          session={session}
          preferences={preferences}
          confirmArchive={confirmSampleArchive}
          additionalPlugins={reviewPlugins}
          agent={agent}
        >
          <ReviewNotice />
        </ComposedConsole>
      )}
      {DevelopmentFeedback && <PreviewFeedback />}
    </Tooltip.Provider>
  );
}

const styles = stylex.create({
  feedbackToolbar: {
    // Agentation's className positions its toolbar, not its viewport annotation layers.
    top: "auto",
    left: "auto",
    right: "var(--preview-feedback-right, 16px)",
    bottom: "var(--preview-feedback-bottom, 96px)",
  },
});

createRoot(document.getElementById("root")!).render(<Preview />);
