import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import {
  Component,
  createElement,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import * as React from "react";

import * as sdkLocale from "../../../../../packages/console-authoring/src/locale";
import type { WorkspaceReads } from "../../../../../packages/console-authoring/src/read";
import type { ReadRefreshPolicy } from "../../../../../packages/console-authoring/src/read-refresh";
import { useConsoleAppearance } from "../../app/console-appearance";
import { useConsoleTranslation } from "../../app/console-i18n";
import { useConsoleLocale } from "../../app/console-locale";
import { useConsoleSession } from "../../app/console-session";
import { RoutePending } from "../../app/route-states";
import { consoleDevConfig } from "../../dev/console-dev-config";
import { consoleReadRefreshPolicy } from "../../lib/read-refresh-policy";
import { useAgentIdentityOptional } from "../agent/agent-identity-context";
import {
  useOptionalAgentQuickPanel,
  type WorkspaceAgentContext,
} from "../agent/agent-quick-panel-context";
import {
  acceptContributionRecovery,
  contributionAssetUrl,
} from "./contribution-asset-url";
import { usePageCatalog, type PageMount } from "./page-contribution-catalog";
import {
  acceptPageImplementationRecovery,
  loadPageImplementation,
  pageMountScopeKey,
} from "./page-mount-runtime";
import { workspacePageHref } from "./workspace-paths";
import { createWorkspaceReads } from "./workspace-read-client";
import {
  createWorkspaceServices,
  type WorkspaceServices,
} from "./workspace-service-client";
import { ContributionSidebar } from "./workspace-sidebar-slot";

type ContributionProps = {
  chrome?: { Sidebar: ComponentType<{ children: ReactNode }> };
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
  mount: PageMount & { scopeKey?: string };
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
  readRefreshPolicy?: ReadRefreshPolicy;
  reads?: WorkspaceReads;
  signal: AbortSignal;
  services: WorkspaceServices;
};

type ContributionModule = {
  apiMajor: 1;
  createWorkspace(runtime: {
    createElement: typeof createElement;
    react: typeof React;
    services: WorkspaceServices;
    modules: Readonly<Record<string, unknown>> | undefined;
  }): {
    Page: ComponentType<ContributionProps>;
    Provider?: ComponentType<{ children: ReactNode }>;
  };
};

type LoadedContribution<Props = ContributionProps> = {
  status: "ready";
  Page: ComponentType<Props>;
  Provider: ComponentType<{ children: ReactNode }>;
  signal: AbortSignal;
  services: WorkspaceServices;
  scopeKey: string;
};

const pageUiModules = { "@lenso/ui/button": { Button } } as const;

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
    color: "var(--muted)",
    lineHeight: 1.5,
    margin: 0,
    maxWidth: "100%",
    overflowWrap: "anywhere",
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
  const unavailableRequirements = useMemo(
    () => unavailableRequiredRequirements(mount),
    [mount]
  );
  const [attempt, setAttempt] = useState(0);
  const loaded = useContributionModule(
    unavailableRequirements.length === 0 ? mount : undefined,
    attempt,
    pageUiModules
  );
  const handoff = useMemo(() => readWorkspaceHandoff(mount), [mount]);
  useEffect(() => consumeWorkspaceHandoff(mount, handoff), [handoff, mount]);
  const segmentsKey = JSON.stringify(segments);
  const stableSegments = useMemo(
    () => JSON.parse(segmentsKey) as readonly string[],
    [segmentsKey]
  );
  const { hash, search } = window.location;
  const environment = useMemo(() => ({ locale, theme }), [locale, theme]);
  const location = useMemo(
    () => ({
      handoff,
      hash,
      search,
      segments: stableSegments,
    }),
    [handoff, hash, search, stableSegments]
  );
  const routingSubject = mount?.subject ?? subject;
  const navigation = useMemo(
    () => workspaceNavigation(mountId, routingSubject, catalog.data ?? []),
    [mountId, routingSubject, catalog.data]
  );
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
  if (unavailableRequirements.length > 0) {
    return (
      <ContributionError
        message={`${t("A required service is unavailable. Refresh the selected App Plan or contact the operator; Console has not loaded this extension.")} ${unavailableRequirements.map((requirement) => `${requirement.service_id} (${requirement.capability_id}, ${requirement.descriptor_version}, ${requirement.source})`).join("; ")}`}
        title={t("Extension requirement unavailable")}
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
      key={`${loaded.scopeKey}:${attempt}`}
      onRetry={() => setAttempt((value) => value + 1)}
      title={t("Extension failed to render")}
    >
      <MountedContribution
        agent={agent}
        environment={environment}
        loaded={loaded}
        location={location}
        mount={mount}
        navigation={navigation}
      />
    </ContributionRenderBoundary>
  );
}

function unavailableRequiredRequirements(mount: PageMount | undefined) {
  return (
    mount?.requirements.filter(
      (requirement) => requirement.required && !requirement.available
    ) ?? []
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
  const client = useQueryClient();
  const readRefreshPolicy = useMemo(
    () => consoleReadRefreshPolicy(mount.id),
    [mount.id]
  );
  const { signal, scopeKey } = loaded;
  const reads = useMemo(
    () =>
      createWorkspaceReads(client, {
        scopeKey,
        localDevelopment: consoleDevConfig.mode === "mock",
        signal,
        policy: readRefreshPolicy,
      }),
    [client, scopeKey, signal, readRefreshPolicy]
  );
  const scopedMount = useMemo(
    () => ({ ...mount, scopeKey }),
    [mount, scopeKey]
  );
  const guardedNavigation = useMemo<ContributionProps["navigation"]>(
    () => ({
      ...navigation,
      go: (segments) => {
        if (!signal.aborted) {
          navigation.go(segments);
        }
      },
      openWorkspace: (request) => {
        if (!signal.aborted) {
          navigation.openWorkspace(request);
        }
      },
    }),
    [navigation, signal]
  );
  if (loaded.signal.aborted) {
    return <RoutePending />;
  }
  return (
    <loaded.Provider>
      <loaded.Page
        chrome={{ Sidebar: ContributionSidebar }}
        agent={agent}
        environment={environment}
        location={location}
        mount={scopedMount}
        navigation={guardedNavigation}
        readRefreshPolicy={readRefreshPolicy}
        reads={reads}
        signal={loaded.signal}
        services={loaded.services}
      />
    </loaded.Provider>
  );
}

type ContributionRenderBoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
  title: string;
};

export class ContributionRenderBoundary extends Component<
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

const workspaceLocaleModules = { "@lenso/console-sdk/locale": sdkLocale };

export function useContributionModule<Props = ContributionProps>(
  mount: PageMount | undefined,
  attempt: number,
  modules: Readonly<Record<string, unknown>> = workspaceLocaleModules
) {
  const { subject: expectedSubject } = useConsoleSession();
  const [state, setState] = useState<
    | {
        mount: PageMount;
        attempt: number;
        modules: typeof modules;
        expectedSubject: string;
        result: LoadedContribution<Props> | { status: "error"; error: Error };
      }
    | undefined
  >();

  useEffect(() => {
    if (!mount) {
      return;
    }
    // Allocate per effect setup, including StrictMode cleanup/setup replay.
    const controller = new AbortController();
    const { signal } = controller;
    const services = createWorkspaceServices(mount, signal, expectedSubject);
    const scopeKey = pageMountScopeKey(mount, expectedSubject);
    const stylesReady = mount.styles.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = contributionAssetUrl(href, attempt > 0);
      link.dataset.consoleContribution = mount.id;
      const ready = new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
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
    setState(undefined);
    const load = async () => {
      try {
        const [value] = await Promise.all([
          loadPageImplementation(mount, attempt > 0),
          Promise.all(stylesReady.map(({ ready }) => ready)),
        ]);
        if (signal.aborted) {
          return;
        }
        if (!isContributionModule(value)) {
          throw new TypeError("The extension module contract is invalid");
        }
        const page = value.createWorkspace({
          createElement,
          react: React,
          services,
          modules,
        });
        if (!page || typeof page.Page !== "function") {
          throw new TypeError("The extension page export is invalid");
        }
        if (attempt > 0) {
          acceptContributionRecovery([mount.module, ...mount.styles]);
          acceptPageImplementationRecovery(mount);
        }
        setState({
          mount,
          attempt,
          modules,
          expectedSubject,
          result: {
            Page: page.Page as ComponentType<Props>,
            Provider: page.Provider ?? PassThroughProvider,
            signal,
            services,
            scopeKey,
            status: "ready",
          },
        });
      } catch (error) {
        if (!signal.aborted) {
          setState({
            mount,
            attempt,
            modules,
            expectedSubject,
            result: {
              error: error instanceof Error ? error : new Error(String(error)),
              status: "error",
            },
          });
        }
      }
    };
    void load();
    return () => {
      controller.abort();
      for (const { link } of stylesReady) {
        link.remove();
      }
    };
  }, [attempt, mount, modules, expectedSubject]);
  return state &&
    state.mount === mount &&
    state.attempt === attempt &&
    state.modules === modules &&
    state.expectedSubject === expectedSubject
    ? state.result
    : { status: mount ? ("loading" as const) : ("idle" as const) };
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
    workspaceHref(
      mounts.find(
        (mount) => mount.id === mountId && sameSubject(mount.subject, subject)
      ),
      segments
    );
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
        workspaceHref(target, request.segments ?? [])
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
  };
}

function workspaceHref(
  mount: PageMount | undefined,
  segments: readonly string[]
) {
  if (!mount) {
    throw new TypeError("Workspace is not available");
  }
  return workspacePageHref(mount, segments);
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

export function ContributionError({
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
