import { ThemeScope } from "@lenso/ui";
import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  PanelsTopLeft,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { useConsoleTranslation } from "../../app/console-i18n";
import { useConsoleSession } from "../../app/console-session";
import { sessionStyles } from "../../app/console-session.stylex";
import { AgentContextNavigation } from "../../features/agent/agent-context-navigation";
import { useAgentIdentity } from "../../features/agent/agent-identity-context";
import { AgentQuickPanel } from "../../features/agent/agent-quick-panel";
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
import { Sidebar } from "../lenso/recipes/console-navigation";
import { ConsoleFrame } from "./console-frame";
import { ConsoleHeader } from "./console-header";
import {
  consoleNavigationModel,
  workspaceRoute,
} from "./console-navigation-model";
import { ConsoleNavigationRail } from "./console-navigation-rail";
import type { ConsoleSearchHandle } from "./console-search";
import { shellStyles } from "./console-shell.stylex";
import { ConsoleWorkspaceHeader } from "./console-workspace-header";
import {
  ContextNavigationContent,
  ContextNavigationItem,
  ContextNavigationSearch,
  ContextNavigationSection,
} from "./context-navigation";
import { useConsoleNavigation } from "./use-console-navigation";

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
  const searchRef = useRef<ConsoleSearchHandle>(null);
  const { agents, selectedAgent } = useAgentIdentity();
  const { selectedApp } = useAppManagement();
  const pageCatalog = usePageCatalog();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const {
    currentArea,
    currentWorkspace,
    currentWorkspaceLocation,
    visibleWorkspaces,
  } = workspaceShellState(currentPath, pageCatalog.data ?? [], selectedApp);
  const navigation = useConsoleNavigation(currentPath);
  const mobileNavigationOpen = navigation.mobileOpen;
  const currentAgentLocation = agentLocationFromPath(currentPath);
  const activeAgent =
    agents.find((agent) => agent.id === currentAgentLocation.agentId) ??
    selectedAgent;
  const closeMobileNavigation = navigation.close;
  const navigateFromSidebar = (action: () => void) => {
    if (mobileNavigationOpen) {
      closeMobileNavigation();
    }
    action();
  };

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
      <ThemeScope theme={appearance.theme} xstyle={shellStyles.theme}>
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
  const { title, destinations, searchItems } = consoleNavigationModel({
    area: currentArea,
    workspace: currentWorkspace,
    segments: currentWorkspaceLocation?.segments ?? [],
    workspaces: visibleWorkspaces,
    agent: activeAgent,
    agents,
    sessionId: currentAgentLocation.sessionId,
    administrator,
    managementEnabled,
    navigate,
    beforeNavigate: () => {
      if (mobileNavigationOpen) {
        closeMobileNavigation();
      }
    },
    translate: t,
  });
  return (
    <ThemeScope theme={appearance.theme} xstyle={shellStyles.theme}>
      <ConsoleFrame
        navigation={navigation}
        rail={
          <ConsoleNavigationRail
            destinations={destinations}
            onSignOut={signOut}
          />
        }
        toolbar={
          <ConsoleHeader
            title={currentArea === "system" ? t("Plugins") : title}
            contextLabel={
              currentArea === "settings"
                ? t("Console")
                : (selectedApp?.label ?? t("Console"))
            }
            navigation={navigation}
            searchItems={searchItems}
            searchRef={searchRef}
          />
        }
        sidebarHeader={
          <ConsoleWorkspaceHeader
            title={title}
            subtitle={
              currentArea === "settings"
                ? t("Console")
                : (selectedApp?.label ?? t("Console"))
            }
            destinations={destinations}
            onClose={closeMobileNavigation}
            onSearch={() => {
              if (mobileNavigationOpen) {
                closeMobileNavigation();
              }
              requestAnimationFrame(() => searchRef.current?.open());
            }}
          />
        }
        sidebar={
          <>
            {currentArea === "management" ? (
              <>
                <ContextNavigationContent>
                  <ContextNavigationItem
                    selected
                    onClick={() =>
                      navigateFromSidebar(() => navigate({ to: "/management" }))
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
              />
            ) : currentArea === "system" ? (
              <SystemSidebar
                navigate={() =>
                  navigateFromSidebar(() => navigate({ to: "/plugins" }))
                }
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
              />
            ) : null}
          </>
        }
      >
        {children}
      </ConsoleFrame>
      {administrator && agents.length > 0 ? (
        <AgentQuickPanel
          suspended={mobileNavigationOpen}
          onOpenFullPage={(agentId, sessionId, projectId) => {
            void navigate({
              to: "/agent/$agentId/$chatId",
              params: { agentId, chatId: sessionId ?? "new-task" },
              search: { project: projectId },
            });
          }}
        />
      ) : null}
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
}: {
  currentSegments: readonly string[];
  mount: PageMount | undefined;
  navigate: (workspace: PageMount, segments: readonly string[]) => void;
}) {
  const t = useConsoleTranslation();

  return (
    <>
      <ContextNavigationContent>
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
      </ContextNavigationContent>
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
  navigate(workspaceRoute(workspace, segments));
}

function sameSegments(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function SystemSidebar({ navigate }: { navigate: () => void }) {
  const t = useConsoleTranslation();

  return (
    <>
      <ContextNavigationContent>
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
      </ContextNavigationContent>
    </>
  );
}

function SettingsSidebar({
  currentPath,
  navigate,
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
