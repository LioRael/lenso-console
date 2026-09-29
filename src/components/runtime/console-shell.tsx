import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  ChevronLeft,
  PanelsTopLeft,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { useConsoleTranslation } from "../../app/console-i18n";
import { useConsoleSession } from "../../app/console-session";
import { sessionStyles } from "../../app/console-session.stylex";
import { AgentContextNavigation } from "../../features/agent/agent-context-navigation";
import { useAgentIdentity } from "../../features/agent/agent-identity-context";
import {
  useAppManagement,
  type ManagedApp,
} from "../../features/apps/app-management-context";
import {
  usePageCatalog,
  type PageMount,
} from "../../features/extensions/page-contribution-catalog";
import {
  WorkspaceSidebarProvider,
  WorkspaceSidebarSlot,
} from "../../features/extensions/workspace-sidebar-slot";
import { ConsoleHeader } from "./console-header";
import { shellStyles } from "./console-shell.stylex";
import {
  ContextNavigationContent,
  ContextNavigationHeader,
  ContextNavigationItem,
  ContextNavigationSearch,
  ContextNavigationSection,
} from "./context-navigation";

type ConsoleArea = "agent" | "settings" | "system" | "workspace" | "management";

export function ConsoleShell({ children }: PropsWithChildren) {
  return (
    <WorkspaceSidebarProvider>
      <ConsoleShellContent>{children}</ConsoleShellContent>
    </WorkspaceSidebarProvider>
  );
}

function ConsoleShellContent({ children }: PropsWithChildren) {
  const { administrator, managementEnabled, signOut } = useConsoleSession();
  const t = useConsoleTranslation();

  const appearance = useConsoleAppearance();
  const navigate = useNavigate();
  const { agents, selectedAgent } = useAgentIdentity();
  const { selectedApp } = useAppManagement();
  const pageCatalog = usePageCatalog();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileNavRef = useRef<HTMLButtonElement>(null);
  const navigationRegionRef = useRef<HTMLDivElement>(null);
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const {
    currentArea,
    currentWorkspace,
    currentWorkspaceLocation,
    visibleWorkspaces,
  } = workspaceShellState(currentPath, pageCatalog.data ?? [], selectedApp);
  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [currentPath]);
  const currentAgentLocation = agentLocationFromPath(currentPath);
  const activeAgent =
    agents.find((agent) => agent.id === currentAgentLocation.agentId) ??
    selectedAgent;
  const closeMobileNavigation = useCallback(() => {
    setMobileNavigationOpen(false);
    requestAnimationFrame(() => mobileNavRef.current?.focus());
  }, []);
  const navigateFromSidebar = (action: () => void) => {
    if (mobileNavigationOpen) {
      closeMobileNavigation();
    }
    action();
  };
  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 720px)");
    const closeOnDesktop = () => {
      if (!mobileViewport.matches) {
        setMobileNavigationOpen(false);
      }
    };
    mobileViewport.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => mobileViewport.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!mobileNavigationOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      navigationRegionRef.current
        ?.querySelector<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled])"
        )
        ?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileNavigation();
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(
        navigationRegionRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled])"
        ) ?? []
      ).filter((element) => element.getClientRects().length > 0);
      const [first] = focusable;
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first && last) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last && first) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavigationOpen, closeMobileNavigation]);

  useEffect(() => {
    if (
      !administrator &&
      currentArea !== "workspace" &&
      currentArea !== "management" &&
      managementEnabled
    ) {
      void navigate({ to: "/management" });
    } else if (
      !administrator &&
      currentArea !== "workspace" &&
      currentArea !== "management" &&
      visibleWorkspaces[0]
    ) {
      navigateToWorkspace(navigate, visibleWorkspaces[0], []);
    }
  }, [
    administrator,
    managementEnabled,
    currentArea,
    navigate,
    visibleWorkspaces,
  ]);
  if (
    !administrator &&
    currentArea !== "workspace" &&
    !(managementEnabled && currentArea === "management")
  ) {
    return (
      <ThemeScope theme={appearance.preference} xstyle={shellStyles.theme}>
        <output {...stylex.props(sessionStyles.root)}>
          <p {...stylex.props(sessionStyles.muted)}>
            {t(
              pageCatalog.isError
                ? "Could not load workspaces"
                : pageCatalog.isPending || visibleWorkspaces.length > 0
                  ? "Loading workspace…"
                  : "No workspaces are available for this account"
            )}
          </p>
          {pageCatalog.isError && (
            <Button
              variant="ghost"
              onClick={() => {
                void pageCatalog.refetch();
              }}
            >
              {t("Retry")}
            </Button>
          )}
          {signOut && (
            <Button
              variant="ghost"
              onClick={() => {
                void signOut();
              }}
            >
              {t("Sign out")}
            </Button>
          )}
        </output>
      </ThemeScope>
    );
  }
  return (
    <ThemeScope theme={appearance.preference} xstyle={shellStyles.theme}>
      <Sidebar.Group xstyle={shellStyles.shell}>
        <ConsoleHeader
          activeAgent={activeAgent}
          agents={administrator ? agents : []}
          mobileNavRef={mobileNavRef}
          mobileNavigationOpen={mobileNavigationOpen}
          onSelectAgent={(agentId) => {
            navigate({
              params: { agentId, chatId: "new-task" },
              to: "/agent/$agentId/$chatId",
            });
          }}
          onToggleMobileNavigation={() =>
            mobileNavigationOpen
              ? closeMobileNavigation()
              : setMobileNavigationOpen(true)
          }
          onOpenWorkspace={(workspace, segments) =>
            navigateToWorkspace(navigate, workspace, segments)
          }
          onSignOut={signOut}
          showAdmin={administrator}
          showManagement={managementEnabled}
          workspaceState={{
            currentArea,
            currentWorkspace,
            currentWorkspaceLocation,
            visibleWorkspaces,
          }}
        />
        <div
          ref={navigationRegionRef}
          {...stylex.props(
            shellStyles.navigationRegion,
            mobileNavigationOpen && shellStyles.navigationRegionOpen
          )}
        >
          <Sidebar.Root
            data-mobile-open={mobileNavigationOpen || undefined}
            defaultOpen
            id="console-sidebar"
            xstyle={[
              shellStyles.contextSidebarRoot,
              mobileNavigationOpen && shellStyles.contextSidebarRootOpen,
            ]}
          >
            <Sidebar.Panel
              aria-label={t("Console context navigation")}
              aria-modal={mobileNavigationOpen ? true : undefined}
              role={mobileNavigationOpen ? "dialog" : undefined}
              xstyle={shellStyles.contextSidebarPanel}
            >
              {currentArea === "management" ? (
                <>
                  <ContextNavigationHeader title={t("Management")} />
                  <ContextNavigationContent>
                    <ContextNavigationItem
                      selected
                      onClick={() =>
                        navigateFromSidebar(() =>
                          navigate({ to: "/management" })
                        )
                      }
                    >
                      {t("Available operations")}
                    </ContextNavigationItem>
                  </ContextNavigationContent>
                </>
              ) : currentArea === "settings" ? (
                <SettingsSidebar
                  currentPath={currentPath}
                  navigate={(to) => navigateFromSidebar(() => navigate({ to }))}
                  onRequestClose={closeMobileNavigation}
                />
              ) : currentArea === "system" ? (
                <SystemSidebar
                  navigate={() =>
                    navigateFromSidebar(() => navigate({ to: "/plugins" }))
                  }
                  onRequestClose={closeMobileNavigation}
                />
              ) : currentArea === "workspace" ? (
                <WorkspaceSidebarSlot>
                  <WorkspaceSidebar
                    mount={currentWorkspace}
                    currentSegments={currentWorkspaceLocation?.segments ?? []}
                    navigate={(workspace, segments) =>
                      navigateFromSidebar(() =>
                        navigateToWorkspace(navigate, workspace, segments)
                      )
                    }
                    onRequestClose={closeMobileNavigation}
                  />
                </WorkspaceSidebarSlot>
              ) : agents.length > 0 ? (
                <AgentContextNavigation
                  agentId={activeAgent.id}
                  agentLabel={activeAgent.label}
                  currentSessionId={currentAgentLocation.sessionId}
                  workspaces={visibleWorkspaces}
                  onOpenWorkspace={(workspace) =>
                    navigateFromSidebar(() =>
                      navigateToWorkspace(navigate, workspace, [])
                    )
                  }
                  onNavigate={() => {
                    if (mobileNavigationOpen) {
                      closeMobileNavigation();
                    }
                  }}
                  onRequestClose={closeMobileNavigation}
                />
              ) : null}
            </Sidebar.Panel>
          </Sidebar.Root>
        </div>

        {mobileNavigationOpen ? (
          <button
            aria-label={t("Close workspace navigation")}
            {...stylex.props(shellStyles.mobileBackdrop)}
            onClick={closeMobileNavigation}
            tabIndex={-1}
            type="button"
          />
        ) : null}

        <main inert={mobileNavigationOpen} {...stylex.props(shellStyles.main)}>
          {children}
        </main>
      </Sidebar.Group>
    </ThemeScope>
  );
}

function agentLocationFromPath(path: string) {
  const qualified = /^\/agent\/([^/]+)\/([^/]+)$/u.exec(path);
  if (qualified?.[1] && qualified[2]) {
    return {
      agentId: decodeURIComponent(qualified[1]),
      sessionId:
        qualified[2] === "new-task"
          ? undefined
          : decodeURIComponent(qualified[2]),
    };
  }
  const legacy = /^\/agent\/([^/]+)$/u.exec(path);
  return {
    agentId: undefined,
    sessionId: legacy?.[1] ? decodeURIComponent(legacy[1]) : undefined,
  };
}

function consoleAreaFromPath(path: string): ConsoleArea {
  if (path.startsWith("/management")) {
    return "management";
  }
  if (path.startsWith("/settings")) {
    return "settings";
  }
  if (path.startsWith("/plugins")) {
    return "system";
  }
  if (path.startsWith("/workspaces/")) {
    return "workspace";
  }
  if (/^\/apps\/[^/]+\/pages\//u.test(path)) {
    return "workspace";
  }
  return "agent";
}

function workspaceShellState(
  path: string,
  mounts: readonly PageMount[],
  selectedApp: ManagedApp | undefined
) {
  const currentArea = consoleAreaFromPath(path);
  const currentWorkspaceLocation = workspaceLocationFromPath(path);
  const currentWorkspaceId = currentWorkspaceLocation?.workspaceId;
  const currentWorkspace = mounts.find(
    (mount) =>
      mount.id === currentWorkspaceId &&
      !!currentWorkspaceLocation &&
      sameWorkspaceSubject(mount.subject, currentWorkspaceLocation.subject)
  );
  const visibleAppId =
    currentWorkspaceLocation?.subject.kind === "app"
      ? currentWorkspaceLocation.subject.appId
      : selectedApp?.scope === "application"
        ? selectedApp.id
        : undefined;
  const visibleWorkspaces = mounts.filter(
    (mount) =>
      mount.subject.kind === "console" ||
      (mount.subject.kind === "app" && mount.subject.appId === visibleAppId)
  );
  return {
    currentArea,
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceLocation,
    visibleWorkspaces,
  };
}

function workspaceLocationFromPath(path: string) {
  const workspace = /^\/workspaces\/([^/]+)(?:\/(.*))?$/u.exec(path);
  if (workspace?.[1]) {
    return {
      segments: workspace[2]
        ? workspace[2].split("/").map((segment) => decodeURIComponent(segment))
        : [],
      subject: { kind: "console" } as const,
      workspaceId: decodeURIComponent(workspace[1]),
    };
  }
  const appWorkspace = /^\/apps\/([^/]+)\/pages\/([^/]+)(?:\/(.*))?$/u.exec(
    path
  );
  if (!(appWorkspace?.[1] && appWorkspace[2])) {
    return undefined;
  }
  return {
    segments: appWorkspace[3]
      ? appWorkspace[3].split("/").map((segment) => decodeURIComponent(segment))
      : [],
    subject: {
      appId: decodeURIComponent(appWorkspace[1]),
      kind: "app",
    } as const,
    workspaceId: decodeURIComponent(appWorkspace[2]),
  };
}

function WorkspaceSidebar({
  currentSegments,
  mount,
  navigate,
  onRequestClose,
}: {
  currentSegments: readonly string[];
  mount: PageMount | undefined;
  navigate: (workspace: PageMount, segments: readonly string[]) => void;
  onRequestClose: () => void;
}) {
  const t = useConsoleTranslation();

  return (
    <>
      <ContextNavigationHeader title={mount?.title ?? t("Workspace")}>
        <IconButton
          aria-label={t("Close workspace navigation")}
          onClick={onRequestClose}
          size="default"
          variant="ghost"
          xstyle={shellStyles.mobileOnly}
        >
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.7} />
        </IconButton>
      </ContextNavigationHeader>
      <Sidebar.Content>
        <Sidebar.Menu aria-label={t("Workspace navigation")}>
          {mount?.navigation.items.map((item) => (
            <Sidebar.MenuItem key={item.path.join("/") || "home"}>
              <ContextNavigationItem
                icon={<PanelsTopLeft size={15} strokeWidth={1.75} />}
                onClick={() => navigate(mount, item.path)}
                selected={sameSegments(currentSegments, item.path)}
              >
                {item.label}
              </ContextNavigationItem>
            </Sidebar.MenuItem>
          ))}
        </Sidebar.Menu>
      </Sidebar.Content>
    </>
  );
}

function sameWorkspaceSubject(
  left: PageMount["subject"],
  right: PageMount["subject"]
) {
  return (
    left.kind === right.kind &&
    (left.kind === "console" ||
      (right.kind === "app" && left.appId === right.appId))
  );
}

function navigateToWorkspace(
  navigate: ReturnType<typeof useNavigate>,
  workspace: PageMount,
  segments: readonly string[]
) {
  const _splat = segments.join("/");
  if (workspace.subject.kind === "console") {
    navigate({
      params: { _splat, workspaceId: workspace.id },
      to: "/workspaces/$workspaceId/$",
    });
    return;
  }
  navigate({
    params: {
      _splat,
      appId: workspace.subject.appId,
      workspaceId: workspace.id,
    },
    to: "/apps/$appId/pages/$workspaceId/$",
  });
}

function sameSegments(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function SystemSidebar({
  navigate,
  onRequestClose,
}: {
  navigate: () => void;
  onRequestClose: () => void;
}) {
  const t = useConsoleTranslation();

  return (
    <>
      <ContextNavigationHeader title={t("System")}>
        <IconButton
          aria-label={t("Close workspace navigation")}
          onClick={onRequestClose}
          size="default"
          variant="ghost"
          xstyle={shellStyles.mobileOnly}
        >
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.7} />
        </IconButton>
      </ContextNavigationHeader>
      <Sidebar.Content>
        <Sidebar.Menu aria-label={t("System navigation")}>
          <Sidebar.MenuItem>
            <ContextNavigationItem
              icon={<Blocks size={15} strokeWidth={1.75} />}
              onClick={navigate}
              selected
            >
              {t("Plugins")}
            </ContextNavigationItem>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.Content>
    </>
  );
}

function SettingsSidebar({
  currentPath,
  navigate,
  onRequestClose,
}: {
  currentPath: string;
  navigate: (
    to:
      | "/"
      | "/settings"
      | "/settings/connections"
      | "/settings/ai"
      | "/settings/profiles"
  ) => void;
  onRequestClose: () => void;
}) {
  const t = useConsoleTranslation();

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (label: string) =>
    normalizedQuery.length === 0 ||
    `${label} ${label
      .split(" ")
      .map((word) => t(word))
      .join(" ")}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  const showPreferences = matches("Preferences");
  const showConnections = matches("Connections accounts models MCP");
  const showProfiles = matches("Profiles instructions tools skills guidance");

  return (
    <>
      <ContextNavigationHeader title={t("Settings")}>
        <IconButton
          aria-label={t("Close workspace navigation")}
          onClick={onRequestClose}
          size="default"
          variant="ghost"
          xstyle={shellStyles.mobileOnly}
        >
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.7} />
        </IconButton>
      </ContextNavigationHeader>
      <ContextNavigationContent>
        <ContextNavigationSearch
          aria-label={t("Search settings")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Search…")}
          value={query}
        />
        {showPreferences ? (
          <ContextNavigationSection label={t("Personal")}>
            <Sidebar.Menu>
              {showPreferences ? (
                <Sidebar.MenuItem>
                  <ContextNavigationItem
                    icon={<SlidersHorizontal size={14} strokeWidth={1.7} />}
                    onClick={() => navigate("/settings")}
                    selected={
                      currentPath === "/settings" ||
                      currentPath === "/settings/appearance"
                    }
                  >
                    {t("Preferences")}
                  </ContextNavigationItem>
                </Sidebar.MenuItem>
              ) : null}
            </Sidebar.Menu>
          </ContextNavigationSection>
        ) : null}
        {showConnections || showProfiles ? (
          <ContextNavigationSection label={t("Agents")}>
            <Sidebar.Menu>
              {showProfiles ? (
                <Sidebar.MenuItem>
                  <ContextNavigationItem
                    icon={<SlidersHorizontal size={14} strokeWidth={1.7} />}
                    onClick={() => navigate("/settings/profiles")}
                    selected={currentPath.startsWith("/settings/profiles")}
                  >
                    {t("Profiles")}
                  </ContextNavigationItem>
                </Sidebar.MenuItem>
              ) : null}
              {showConnections ? (
                <Sidebar.MenuItem>
                  <ContextNavigationItem
                    icon={<Sparkles size={14} strokeWidth={1.7} />}
                    onClick={() => navigate("/settings/connections")}
                    selected={
                      currentPath.startsWith("/settings/connections") ||
                      currentPath.startsWith("/settings/ai")
                    }
                  >
                    {t("Connections")}
                  </ContextNavigationItem>
                </Sidebar.MenuItem>
              ) : null}
            </Sidebar.Menu>
          </ContextNavigationSection>
        ) : null}
        {!showPreferences && !showConnections && !showProfiles ? (
          <p {...stylex.props(shellStyles.settingsSearchEmpty)}>
            {t("No settings found")}
          </p>
        ) : null}
      </ContextNavigationContent>
    </>
  );
}
