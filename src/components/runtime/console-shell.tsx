import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  ChevronLeft,
  CircleHelp,
  MousePointer2,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useState, type PropsWithChildren } from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { useConsoleTranslation } from "../../app/console-i18n";
import { AgentContextNavigation } from "../../features/agent/agent-context-navigation";
import { useAgentIdentity } from "../../features/agent/agent-identity-context";
import { AgentQuickPanel } from "../../features/agent/agent-quick-panel";
import { shellStyles } from "./console-shell.stylex";
import {
  ContextNavigationContent,
  ContextNavigationHeader,
  ContextNavigationItem,
  ContextNavigationSearch,
  ContextNavigationSection,
} from "./context-navigation";

type ConsoleArea = "agent" | "settings" | "system";

export function ConsoleShell({ children }: PropsWithChildren) {
  const t = useConsoleTranslation();

  const appearance = useConsoleAppearance();
  const navigate = useNavigate();
  const { agents, selectedAgent } = useAgentIdentity();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const currentArea = consoleAreaFromPath(currentPath);
  const currentAgentLocation = agentLocationFromPath(currentPath);
  const activeAgent =
    agents.find((agent) => agent.id === currentAgentLocation.agentId) ??
    selectedAgent;

  return (
    <ThemeScope theme={appearance.preference} xstyle={shellStyles.theme}>
      <Sidebar.Group xstyle={shellStyles.shell}>
        <div {...stylex.props(shellStyles.navigationRegion)}>
          <PrimaryRail
            contextNavigationOpen={mobileNavigationOpen}
            currentArea={currentArea}
            navigate={(to) => {
              setMobileNavigationOpen(false);
              navigate({ to });
            }}
            onToggleContextNavigation={() =>
              setMobileNavigationOpen((open) => !open)
            }
          />
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
              xstyle={[
                shellStyles.contextSidebarPanel,
                mobileNavigationOpen && shellStyles.contextSidebarPanelOpen,
              ]}
            >
              {currentArea === "settings" ? (
                <SettingsSidebar
                  currentPath={currentPath}
                  navigate={(to) => {
                    setMobileNavigationOpen(false);
                    navigate({ to });
                  }}
                  onRequestClose={() => setMobileNavigationOpen(false)}
                />
              ) : currentArea === "system" ? (
                <SystemSidebar
                  navigate={() => {
                    setMobileNavigationOpen(false);
                    navigate({ to: "/plugins" });
                  }}
                  onRequestClose={() => setMobileNavigationOpen(false)}
                />
              ) : (
                <AgentContextNavigation
                  agentId={activeAgent.id}
                  agentLabel={activeAgent.label}
                  currentSessionId={currentAgentLocation.sessionId}
                  onNavigate={() => setMobileNavigationOpen(false)}
                  onRequestClose={() => setMobileNavigationOpen(false)}
                />
              )}
            </Sidebar.Panel>
          </Sidebar.Root>
        </div>

        {mobileNavigationOpen ? (
          <button
            aria-label={t("Close workspace navigation")}
            {...stylex.props(shellStyles.mobileBackdrop)}
            onClick={() => setMobileNavigationOpen(false)}
            type="button"
          />
        ) : null}

        <main {...stylex.props(shellStyles.main)}>{children}</main>

        <footer
          aria-label={t("Application utilities")}
          {...stylex.props(shellStyles.utilities)}
        >
          <AgentQuickPanel
            onOpenFullPage={(agentId, sessionId) => {
              navigate({
                params: { agentId, chatId: sessionId ?? "new-task" },
                to: "/agent/$agentId/$chatId",
              });
            }}
          />
        </footer>
      </Sidebar.Group>
    </ThemeScope>
  );
}

function PrimaryRail({
  contextNavigationOpen,
  currentArea,
  navigate,
  onToggleContextNavigation,
}: {
  contextNavigationOpen: boolean;
  currentArea: ConsoleArea;
  navigate: (to: "/" | "/plugins" | "/settings") => void;
  onToggleContextNavigation: () => void;
}) {
  const t = useConsoleTranslation();

  return (
    <Sidebar.Root
      defaultOpen
      id="console-primary-rail"
      xstyle={shellStyles.primaryRailRoot}
    >
      <Sidebar.Panel
        aria-label={t("Global navigation")}
        render={<nav />}
        xstyle={shellStyles.primaryRail}
      >
        <button
          aria-label={t("Open workspace switcher")}
          {...stylex.props(
            shellStyles.railWorkspace,
            shellStyles.desktopWorkspace
          )}
          type="button"
        >
          L
        </button>
        <button
          aria-controls="console-sidebar"
          aria-expanded={contextNavigationOpen}
          aria-label={
            contextNavigationOpen
              ? t("Close workspace navigation")
              : "Open workspace navigation"
          }
          {...stylex.props(shellStyles.railWorkspace, shellStyles.mobileOnly)}
          onClick={onToggleContextNavigation}
          type="button"
        >
          L
        </button>
        <div {...stylex.props(shellStyles.railAreas)}>
          <IconButton
            aria-label={t("Agent")}
            onClick={() => navigate("/")}
            size="default"
            variant="ghost"
            xstyle={[
              shellStyles.railButton,
              currentArea === "agent" && shellStyles.activeRailButton,
            ]}
          >
            <MousePointer2 aria-hidden="true" size={15} strokeWidth={1.7} />
          </IconButton>
          <IconButton
            aria-label={t("System")}
            onClick={() => navigate("/plugins")}
            size="default"
            variant="ghost"
            xstyle={[
              shellStyles.railButton,
              currentArea === "system" && shellStyles.activeRailButton,
            ]}
          >
            <Blocks aria-hidden="true" size={15} strokeWidth={1.7} />
          </IconButton>
        </div>
        <div {...stylex.props(shellStyles.railFooter)}>
          <IconButton
            aria-label={t("Preferences")}
            onClick={() => navigate("/settings")}
            size="default"
            variant="ghost"
            xstyle={[
              shellStyles.railButton,
              currentArea === "settings" && shellStyles.activeRailButton,
            ]}
          >
            <Settings aria-hidden="true" size={15} strokeWidth={1.7} />
          </IconButton>
          <IconButton
            aria-label={t("Help")}
            size="default"
            variant="ghost"
            xstyle={shellStyles.railButton}
          >
            <CircleHelp aria-hidden="true" size={15} strokeWidth={1.7} />
          </IconButton>
          <button
            aria-label={t("Local operator profile")}
            {...stylex.props(shellStyles.railProfile)}
            type="button"
          >
            LO
          </button>
        </div>
      </Sidebar.Panel>
    </Sidebar.Root>
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
  if (path.startsWith("/settings")) {
    return "settings";
  }
  if (path.startsWith("/plugins")) {
    return "system";
  }
  return "agent";
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
