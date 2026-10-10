import * as consoleReact from "@lenso/console-react";
import type { PageProps } from "@lenso/console-sdk";
import {
  ConsoleBrowserMount,
  consoleMountHref,
  consoleMountKey,
  findConsoleMount,
  useConsoleAdmission,
  type BrowserAdmission,
  type BrowserMount,
} from "@lenso/console-sdk/browser";
import * as consoleLocale from "@lenso/console-sdk/react/locale";
import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { House } from "lucide-react";
import * as React from "react";

import { ConsoleIconButton } from "../components/console/console-icon-button";
import { ConsoleLayout } from "../components/console/console-layout";
import { useConsoleAppearance } from "./console-appearance";
import { RouteNotFound, RoutePending } from "./route-states";

const AdmissionContext = React.createContext<
  ReturnType<typeof useConsoleAdmission> | undefined
>(undefined);

const styles = stylex.create({
  content: {
    paddingBlockStart: 80,
    paddingBlockEnd: 80,
    paddingInline: 32,
  },
});

export type ConsolePendingHandoff = {
  admission: BrowserAdmission;
  destinationKey: string;
  destinationHref: string;
  value: NonNullable<PageProps["location"]["handoff"]>;
};

export function consoleHandoffForLocation(
  pending: ConsolePendingHandoff | undefined,
  admission: BrowserAdmission | undefined,
  mount: BrowserMount | undefined,
  href: string
) {
  return pending &&
    admission &&
    mount &&
    pending.admission === admission &&
    pending.destinationKey === consoleMountKey(admission, mount) &&
    pending.destinationHref === href
    ? pending.value
    : undefined;
}

export function ConsoleAdmissionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useConsoleAdmission();
  return (
    <AdmissionContext.Provider value={value}>
      {children}
    </AdmissionContext.Provider>
  );
}

/** Static Shell routes remain unchanged; only admitted owner-built pages fill other paths. */
export function ConsoleAdmittedPage() {
  const value = React.useContext(AdmissionContext);
  const location = useLocation();
  const [pendingHandoff, setPendingHandoff] =
    React.useState<ConsolePendingHandoff>();
  const admission = value?.admission;
  const mount = findConsoleMount(admission, location.pathname);
  React.useEffect(() => {
    setPendingHandoff((pending) =>
      consoleHandoffForLocation(pending, admission, mount, location.href)
        ? pending
        : undefined
    );
  }, [admission, mount, location.href]);
  if (!value) {
    throw new Error("Console admission requires its provider.");
  }
  if (value.error) {
    return (
      <main role="alert">
        <p>{value.error.message}</p>
        <Button onClick={() => value.retry()}>Retry admission</Button>
      </main>
    );
  }
  if (!value.admission) {
    return <RoutePending />;
  }
  if (!mount) {
    return <RouteNotFound />;
  }
  return (
    <ConsoleLayout>
      <AdmittedActionHost>
        <ConsoleBrowserMount
          admission={value.admission}
          mount={mount}
          key={consoleMountKey(value.admission, mount)}
        >
          {(runtime) => (
            <OwnerPage
              admission={value.admission!}
              mount={mount}
              runtime={runtime}
              handoff={consoleHandoffForLocation(
                pendingHandoff,
                admission,
                mount,
                location.href
              )}
              onClearHandoff={() => setPendingHandoff(undefined)}
              onHandoff={(destination, destinationHref, handoff) => {
                setPendingHandoff(
                  handoff && admission
                    ? {
                        admission,
                        destinationKey: consoleMountKey(admission, destination),
                        destinationHref,
                        value: handoff,
                      }
                    : undefined
                );
              }}
            />
          )}
        </ConsoleBrowserMount>
      </AdmittedActionHost>
    </ConsoleLayout>
  );
}

function AdmittedActionHost({ children }: { children: React.ReactNode }) {
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  return (
    <consoleReact.ConsoleActionHost
      render={(selection) => (
        <ConsoleLayout.Foreground>
          <consoleReact.ConsoleDock
            visible={!!selection}
            position="bottom"
            compact={false}
            activeId=""
            items={[]}
            selection={selection}
            running={selection?.running ?? false}
            dockRef={dockRef}
            onNavigate={() => undefined}
            onExpand={() => undefined}
            onFocusDock={() => undefined}
          />
        </ConsoleLayout.Foreground>
      )}
    >
      {children}
    </consoleReact.ConsoleActionHost>
  );
}

type WorkspaceModule = {
  apiMajor: 1;
  createWorkspace(runtime: {
    react: typeof React;
    createElement: typeof React.createElement;
    services: PageProps["services"];
    modules: {
      "@lenso/console-react": typeof consoleReact;
      "@lenso/console-sdk/react/locale": typeof consoleLocale;
      "@lenso/console-sdk/locale": typeof consoleLocale;
    };
  }): { Page: React.ComponentType<PageProps> };
};

function admittedAsset(path: string) {
  const url = new URL(path, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error("Console page assets must remain on the admitted origin.");
  }
  return url.href;
}

function OwnerPage({
  admission,
  mount,
  runtime,
  handoff,
  onClearHandoff,
  onHandoff,
}: {
  admission: BrowserAdmission;
  mount: BrowserMount;
  runtime: Pick<PageProps, "services" | "reads" | "signal">;
  handoff: PageProps["location"]["handoff"];
  onClearHandoff: () => void;
  onHandoff: (
    destination: BrowserMount,
    destinationHref: string,
    value: PageProps["location"]["handoff"]
  ) => void;
}) {
  const [pageComponent, setPageComponent] =
    React.useState<React.ComponentType<PageProps>>();
  const [loadError, setLoadError] = React.useState<Error>();
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const { theme } = useConsoleAppearance();
  const { activation, signal } = consoleReact.useConsoleActivation(
    location.pathname,
    runtime.signal
  );
  React.useEffect(() => {
    let active = true;
    const stylesheets: HTMLLinkElement[] = [];
    const load = async () => {
      const module: WorkspaceModule = await import(
        // @vite-ignore
        admittedAsset(mount.module)
      );
      runtime.signal.throwIfAborted();
      if (!active) {
        return;
      }
      if (
        module.apiMajor !== 1 ||
        typeof module.createWorkspace !== "function"
      ) {
        throw new Error("Console page module is incompatible.");
      }
      for (const href of mount.styles) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = admittedAsset(href);
        document.head.append(link);
        stylesheets.push(link);
      }
      const workspace = module.createWorkspace({
        react: React,
        createElement: React.createElement,
        services: runtime.services,
        modules: {
          "@lenso/console-react": consoleReact,
          "@lenso/console-sdk/react/locale": consoleLocale,
          "@lenso/console-sdk/locale": consoleLocale,
        },
      });
      setPageComponent(() => workspace.Page);
    };
    const initialize = async () => {
      try {
        await load();
      } catch (error) {
        if (active && !runtime.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error
              : new Error("Console page failed to load.")
          );
        }
      }
    };
    void initialize();
    return () => {
      active = false;
      stylesheets.forEach((link) => link.remove());
    };
  }, [mount, runtime]);
  if (loadError) {
    throw loadError;
  }
  if (!pageComponent) {
    return <RoutePending />;
  }
  const Page = pageComponent;
  return (
    <>
      <ConsoleLayout.Corner area="topLeft">
        <ConsoleIconButton
          label="Home"
          tooltip="Home"
          onClick={() => {
            runtime.signal.throwIfAborted();
            onClearHandoff();
            void navigate({ to: "/" });
          }}
        >
          <House aria-hidden="true" size={18} />
        </ConsoleIconButton>
      </ConsoleLayout.Corner>
      <div {...stylex.props(styles.content)}>
        <Page
          {...runtime}
          activation={activation}
          signal={signal}
          mount={mount}
          params={{}}
          environment={{ locale: "en", theme }}
          location={{
            hash: location.hash,
            search: location.searchStr,
            segments: location.pathname
              .slice(mount.basePath.replace(/\/$/u, "").length)
              .split("/")
              .filter(Boolean)
              .map(decodeURIComponent),
            ...(handoff ? { handoff } : {}),
          }}
          navigation={{
            href: (segments) => consoleMountHref(mount, segments),
            go: (segments) => {
              runtime.signal.throwIfAborted();
              onClearHandoff();
              void navigate({ to: consoleMountHref(mount, segments) });
            },
            openWorkspace: ({
              workspaceId,
              subject,
              segments = [],
              handoff: next,
            }) => {
              runtime.signal.throwIfAborted();
              const other = admission.mounts.find(
                (candidate) =>
                  (candidate.id === workspaceId ||
                    candidate.pageId === workspaceId) &&
                  candidate.subject.kind === subject.kind &&
                  (subject.kind === "console" ||
                    (candidate.subject.kind === "app" &&
                      candidate.subject.appId === subject.appId))
              );
              if (!other) {
                throw new Error("Workspace is not admitted.");
              }
              const destinationHref = router.buildLocation({
                to: consoleMountHref(other, segments),
              }).href;
              onHandoff(other, destinationHref, next);
              void navigate({ href: destinationHref });
            },
          }}
        />
      </div>
    </>
  );
}
