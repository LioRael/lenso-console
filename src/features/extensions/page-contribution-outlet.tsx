import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import {
  Component,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import * as React from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { useConsoleTranslation } from "../../app/console-i18n";
import { useConsoleLocale } from "../../app/console-locale";
import { RoutePending } from "../../app/route-states";
import { useAgentIdentityOptional } from "../agent/agent-identity-context";
import {
  useOptionalAgentQuickPanel,
  type WorkspaceAgentContext,
} from "../agent/agent-quick-panel-context";
import { usePageCatalog, type PageMount } from "./page-contribution-catalog";
import {
  createWorkspaceServices,
  type WorkspaceServices,
} from "./workspace-service-client";

type ContributionProps = {
  agent?:
    | {
        completedTurns: number;
        requestDraft?: (draft: string) => void;
        setPageContext: (context: WorkspaceAgentContext | null) => void;
      }
    | undefined;
  environment: { locale: "en" | "zh-CN"; theme: "dark" | "light" };
  location: {
    handoff?: { kind: string; payload: unknown } | undefined;
    hash: string;
    search: string;
    segments: readonly string[];
  };
  mount: PageMount;
  navigation: {
    go: (segments: readonly string[]) => void;
    href: (segments: readonly string[]) => string;
    openWorkspace: (request: {
      handoff?: { kind: string; payload: unknown };
      segments?: readonly string[];
      subject: PageMount["subject"];
      workspaceId: string;
    }) => void;
  };
  signal: AbortSignal;
};

type ContributionModule = {
  apiMajor: 1;
  createWorkspace(runtime: {
    createElement: typeof createElement;
    react: typeof React;
    services: WorkspaceServices;
  }): {
    Page: ComponentType<ContributionProps>;
    Provider?: ComponentType<{ children: ReactNode }>;
  };
};

type LoadedContribution = {
  status: "ready";
  Page: ComponentType<ContributionProps>;
  Provider: ComponentType<{ children: ReactNode }>;
};

const styles = stylex.create({
  error: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "64px 24px",
  },
  heading: {
    fontSize: "20px",
    margin: 0,
  },
  message: {
    color: "var(--lenso-color-text-secondary)",
    lineHeight: 1.5,
    margin: 0,
  },
});

export function PageContributionOutlet({
  mountId,
  segments,
  subject,
}: {
  mountId: string;
  segments: readonly string[];
  subject: PageMount["subject"];
}) {
  const t = useConsoleTranslation();
  const { theme } = useConsoleAppearance();
  const { locale } = useConsoleLocale();
  const catalog = usePageCatalog();
  const agentIdentity = useAgentIdentityOptional();
  const agentPanel = useOptionalAgentQuickPanel();
  const mount = catalog.data?.find(
    (candidate) =>
      candidate.id === mountId && sameSubject(candidate.subject, subject)
  );
  const [attempt, setAttempt] = useState(0);
  const loaded = useContributionModule(mount, attempt);
  const handoff = useMemo(() => readWorkspaceHandoff(mount), [mount]);
  useEffect(() => consumeWorkspaceHandoff(mount, handoff), [handoff, mount]);
  const location = useMemo(
    () => ({
      handoff,
      hash: window.location.hash,
      search: window.location.search,
      segments,
    }),
    [handoff, segments]
  );
  const navigation = workspaceNavigation(mountId, subject, catalog.data ?? []);
  const appAgent = agentIdentity?.agents.find((agent) => agent.role === "app");
  const agent = agentPanel
    ? {
        completedTurns: agentPanel.completedTurns,
        setPageContext: agentPanel.setPageContext,
        ...(appAgent
          ? {
              requestDraft: (draft: string) => {
                const bytes = new TextEncoder().encode(draft).byteLength;
                if (!draft.trim() || bytes > 8192) {
                  throw new TypeError("Agent draft is outside reviewed bounds");
                }
                agentPanel.requestAgentDraft({ agentId: appAgent.id, draft });
              },
            }
          : {}),
      }
    : undefined;

  if (catalog.isPending || (mount && loaded.status === "loading")) {
    return <RoutePending />;
  }
  if (catalog.error) {
    return (
      <ContributionError
        message={catalog.error.message}
        onRetry={() => void catalog.refetch()}
        title={t("Extension catalog unavailable")}
      />
    );
  }
  if (!mount) {
    return (
      <ContributionError
        message={t("This page contribution is not installed or enabled.")}
        title={t("Extension unavailable")}
      />
    );
  }
  if (loaded.status === "error") {
    return (
      <ContributionError
        message={loaded.error.message}
        onRetry={() => setAttempt((value) => value + 1)}
        title={t("Extension failed to load")}
      />
    );
  }
  if (loaded.status !== "ready") {
    return <RoutePending />;
  }
  return (
    <ContributionRenderBoundary
      key={`${mount.id}:${mount.revision}:${attempt}`}
      onRetry={() => setAttempt((value) => value + 1)}
      title={t("Extension failed to render")}
    >
      <MountedContribution
        agent={agent}
        environment={{ locale, theme }}
        loaded={loaded}
        location={location}
        mount={mount}
        navigation={navigation}
      />
    </ContributionRenderBoundary>
  );
}

function MountedContribution({
  agent,
  environment,
  loaded,
  location,
  mount,
  navigation,
}: {
  agent: ContributionProps["agent"];
  environment: ContributionProps["environment"];
  loaded: LoadedContribution;
  location: ContributionProps["location"];
  mount: PageMount;
  navigation: ContributionProps["navigation"];
}) {
  const controllerRef = useRef<AbortController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new AbortController();
  }
  const controller = controllerRef.current;
  useEffect(() => () => controller.abort(), [controller]);
  return (
    <loaded.Provider>
      <loaded.Page
        agent={agent}
        environment={environment}
        location={location}
        mount={mount}
        navigation={navigation}
        signal={controller.signal}
      />
    </loaded.Provider>
  );
}

type ContributionRenderBoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
  title: string;
};

class ContributionRenderBoundary extends Component<
  ContributionRenderBoundaryProps,
  { error?: Error }
> {
  constructor(props: ContributionRenderBoundaryProps) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  render() {
    return this.state.error ? (
      <ContributionError
        message={this.state.error.message}
        onRetry={this.props.onRetry}
        title={this.props.title}
      />
    ) : (
      this.props.children
    );
  }
}

function useContributionModule(mount: PageMount | undefined, attempt: number) {
  const [state, setState] = useState<
    | { status: "idle" | "loading" }
    | LoadedContribution
    | { status: "error"; error: Error }
  >({ status: "idle" });

  useEffect(() => {
    if (!mount) {
      setState({ status: "idle" });
      return;
    }
    let current = true;
    const stylesReady = mount.styles.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.consoleContribution = mount.id;
      const ready = new Promise<void>((resolve, reject) => {
        link.addEventListener("load", () => resolve(), { once: true });
        link.addEventListener(
          "error",
          () => reject(new Error(`Extension style failed to load: ${href}`)),
          { once: true }
        );
      });
      document.head.append(link);
      return { link, ready };
    });
    setState({ status: "loading" });
    const load = async () => {
      try {
        await Promise.all(stylesReady.map(({ ready }) => ready));
        // eslint-disable-next-line no-inline-comments -- Vite requires this import annotation.
        const value: unknown = await import(/* @vite-ignore */ mount.module);
        if (!current) {
          return;
        }
        if (!isContributionModule(value)) {
          throw new TypeError("The extension module contract is invalid");
        }
        const page = value.createWorkspace({
          createElement,
          react: React,
          services: createWorkspaceServices(mount),
        });
        if (!page || typeof page.Page !== "function") {
          throw new TypeError("The extension page export is invalid");
        }
        setState({
          Page: page.Page,
          Provider: page.Provider ?? PassThroughProvider,
          status: "ready",
        });
      } catch (error) {
        if (current) {
          setState({
            error: error instanceof Error ? error : new Error(String(error)),
            status: "error",
          });
        }
      }
    };
    void load();
    return () => {
      current = false;
      for (const { link } of stylesReady) {
        link.remove();
      }
    };
  }, [attempt, mount]);
  return state;
}

function isContributionModule(value: unknown): value is ContributionModule {
  return (
    !!value &&
    typeof value === "object" &&
    "apiMajor" in value &&
    value.apiMajor === 1 &&
    "createWorkspace" in value &&
    typeof value.createWorkspace === "function"
  );
}

function PassThroughProvider({ children }: { children: ReactNode }) {
  return children;
}

const HANDOFF_STATE_KEY = "__lensoWorkspaceHandoff";

function workspaceNavigation(
  mountId: string,
  subject: PageMount["subject"],
  mounts: readonly PageMount[]
) {
  const href = (segments: readonly string[]) =>
    workspaceHref(mountId, subject, segments);
  return {
    href,
    go: (segments: readonly string[]) => {
      window.history.pushState(window.history.state, "", href(segments));
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    openWorkspace: (request: {
      handoff?: { kind: string; payload: unknown };
      segments?: readonly string[];
      subject: PageMount["subject"];
      workspaceId: string;
    }) => {
      const target = mounts.find(
        (candidate) =>
          candidate.id === request.workspaceId &&
          sameSubject(candidate.subject, request.subject)
      );
      if (!target) {
        throw new TypeError("Target workspace is not available");
      }
      const { [HANDOFF_STATE_KEY]: _previousHandoff, ...state } =
        window.history.state ?? {};
      const nextState = request.handoff
        ? {
            ...state,
            [HANDOFF_STATE_KEY]: checkedHandoff(target, request.handoff),
          }
        : state;
      window.history.pushState(
        nextState,
        "",
        workspaceHref(target.id, target.subject, request.segments ?? [])
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
  };
}

function workspaceHref(
  mountId: string,
  subject: PageMount["subject"],
  segments: readonly string[]
) {
  if (
    !segments.every((segment) =>
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(segment)
    )
  ) {
    throw new TypeError("Workspace navigation path is invalid");
  }
  const suffix = segments.length ? `/${segments.join("/")}` : "";
  return subject.kind === "console"
    ? `/workspaces/${encodeURIComponent(mountId)}${suffix}`
    : `/apps/${encodeURIComponent(subject.appId)}/pages/${encodeURIComponent(mountId)}${suffix}`;
}

function checkedHandoff(
  target: PageMount,
  handoff: { kind: string; payload: unknown }
) {
  if (!/^[a-z][a-z0-9.-]{0,95}@[1-9][0-9]*$/u.test(handoff.kind)) {
    throw new TypeError("Workspace handoff kind is invalid");
  }
  let payload: unknown;
  try {
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- The JSON round-trip intentionally rejects non-JSON handoff data.
    payload = JSON.parse(JSON.stringify(handoff.payload));
  } catch {
    throw new TypeError("Workspace handoff payload is not JSON data");
  }
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 16_384) {
    throw new TypeError("Workspace handoff payload exceeds 16 KiB");
  }
  return {
    handoff: { kind: handoff.kind, payload },
    subject: target.subject,
    workspaceId: target.id,
  };
}

function readWorkspaceHandoff(mount: PageMount | undefined) {
  const stored = window.history.state?.[HANDOFF_STATE_KEY] as
    | {
        handoff?: { kind?: unknown; payload?: unknown };
        subject?: PageMount["subject"];
        workspaceId?: unknown;
      }
    | undefined;
  if (
    !mount ||
    stored?.workspaceId !== mount.id ||
    !stored.subject ||
    !sameSubject(stored.subject, mount.subject) ||
    typeof stored.handoff?.kind !== "string"
  ) {
    return undefined;
  }
  return { kind: stored.handoff.kind, payload: stored.handoff.payload };
}

function consumeWorkspaceHandoff(
  mount: PageMount | undefined,
  handoff: ContributionProps["location"]["handoff"]
) {
  if (!(mount && handoff && readWorkspaceHandoff(mount))) {
    return;
  }
  const { [HANDOFF_STATE_KEY]: _consumed, ...state } =
    window.history.state ?? {};
  window.history.replaceState(state, "", window.location.href);
}

function sameSubject(left: PageMount["subject"], right: PageMount["subject"]) {
  return (
    left.kind === right.kind &&
    (left.kind === "console" ||
      (right.kind === "app" && left.appId === right.appId))
  );
}

function ContributionError({
  message,
  onRetry,
  title,
}: {
  message: string;
  onRetry?: () => void;
  title: string;
}) {
  const t = useConsoleTranslation();
  return (
    <section {...stylex.props(styles.error)}>
      <h1 {...stylex.props(styles.heading)}>{title}</h1>
      <p {...stylex.props(styles.message)}>{message}</p>
      {onRetry ? <Button onClick={onRetry}>{t("Try again")}</Button> : null}
    </section>
  );
}
