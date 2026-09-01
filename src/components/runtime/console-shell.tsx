import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  Bot,
  ChevronLeft,
  CircleHelp,
  MousePointer2,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useState, type PropsWithChildren } from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { AgentContextNavigation } from "../../features/agent/agent-context-navigation";
import { AgentQuickPanel } from "../../features/agent/agent-quick-panel";
import { shellStyles } from "./console-shell.stylex";
import {
  ContextNavigationHeader,
  ContextNavigationItem,
  ContextNavigationSection,
} from "./context-navigation";

type ConsoleArea = "agent" | "settings" | "system";

export function ConsoleShell({ children }: PropsWithChildren) {
  const appearance = useConsoleAppearance();
  const navigate = useNavigate();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const currentArea = consoleAreaFromPath(currentPath);
  const currentAgentSessionId = agentSessionIdFromPath(currentPath);

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
              aria-label="Console context navigation"
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
                  currentSessionId={currentAgentSessionId}
                  onNavigate={() => setMobileNavigationOpen(false)}
                  onRequestClose={() => setMobileNavigationOpen(false)}
                />
              )}
            </Sidebar.Panel>
          </Sidebar.Root>
        </div>

        {mobileNavigationOpen ? (
          <button
            aria-label="Close workspace navigation"
            {...stylex.props(shellStyles.mobileBackdrop)}
            onClick={() => setMobileNavigationOpen(false)}
            type="button"
          />
        ) : null}

        <main {...stylex.props(shellStyles.main)}>{children}</main>

        <footer
          aria-label="Application utilities"
          {...stylex.props(shellStyles.utilities)}
        >
          <AgentQuickPanel
            onOpenFullPage={(sessionId) => {
              if (sessionId) {
                navigate({
                  params: { chatId: sessionId },
                  to: "/agent/$chatId",
                });
                return;
              }
              navigate({ to: "/" });
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
  return (
    <Sidebar.Root
      defaultOpen
      id="console-primary-rail"
      xstyle={shellStyles.primaryRailRoot}
    >
      <Sidebar.Panel
        aria-label="Global navigation"
        render={<nav />}
        xstyle={shellStyles.primaryRail}
      >
        <button
          aria-label="Open workspace switcher"
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
              ? "Close workspace navigation"
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
            aria-label="Agent"
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
            aria-label="System"
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
            aria-label="Preferences"
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
            aria-label="Help"
            size="default"
            variant="ghost"
            xstyle={shellStyles.railButton}
          >
            <CircleHelp aria-hidden="true" size={15} strokeWidth={1.7} />
          </IconButton>
          <button
            aria-label="Local operator profile"
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

function agentSessionIdFromPath(path: string) {
  const match = /^\/agent\/([^/]+)$/u.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
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
  return (
    <>
      <ContextNavigationHeader title="System">
        <IconButton
          aria-label="Close workspace navigation"
          onClick={onRequestClose}
          size="default"
          variant="ghost"
          xstyle={shellStyles.mobileOnly}
        >
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.7} />
        </IconButton>
      </ContextNavigationHeader>
      <Sidebar.Content>
        <Sidebar.Menu aria-label="System navigation">
          <Sidebar.MenuItem>
            <ContextNavigationItem
              icon={<Blocks size={15} strokeWidth={1.75} />}
              onClick={navigate}
              selected
            >
              Plugins
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
    to: "/" | "/settings" | "/settings/agent" | "/settings/ai"
  ) => void;
  onRequestClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (label: string) =>
    normalizedQuery.length === 0 ||
    label.toLocaleLowerCase().includes(normalizedQuery);
  const showPreferences = matches("Preferences");
  const showPersonalization = matches("Agent personalization");
  const showAiAgents = matches("AI & Agents");

  return (
    <>
      <ContextNavigationHeader title="Settings">
        <IconButton
          aria-label="Close workspace navigation"
          onClick={onRequestClose}
          size="default"
          variant="ghost"
          xstyle={shellStyles.mobileOnly}
        >
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.7} />
        </IconButton>
      </ContextNavigationHeader>
      <Sidebar.Content xstyle={shellStyles.settingsSidebarContent}>
        <label {...stylex.props(shellStyles.settingsSearch)}>
          <Search aria-hidden="true" size={14} strokeWidth={1.7} />
          <input
            {...stylex.props(shellStyles.settingsSearchInput)}
            aria-label="Search settings"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            value={query}
          />
        </label>
        {showPreferences || showPersonalization ? (
          <ContextNavigationSection label="Personal">
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
                    Preferences
                  </ContextNavigationItem>
                </Sidebar.MenuItem>
              ) : null}
              {showPersonalization ? (
                <Sidebar.MenuItem>
                  <ContextNavigationItem
                    icon={<Bot size={14} strokeWidth={1.7} />}
                    onClick={() => navigate("/settings/agent")}
                    selected={currentPath.startsWith("/settings/agent")}
                  >
                    Agent personalization
                  </ContextNavigationItem>
                </Sidebar.MenuItem>
              ) : null}
            </Sidebar.Menu>
          </ContextNavigationSection>
        ) : null}
        {showAiAgents ? (
          <ContextNavigationSection label="Features">
            <Sidebar.Menu>
              <Sidebar.MenuItem>
                <ContextNavigationItem
                  icon={<Sparkles size={14} strokeWidth={1.7} />}
                  onClick={() => navigate("/settings/ai")}
                  selected={currentPath.startsWith("/settings/ai")}
                >
                  AI &amp; Agents
                </ContextNavigationItem>
              </Sidebar.MenuItem>
            </Sidebar.Menu>
          </ContextNavigationSection>
        ) : null}
        {!showPreferences && !showPersonalization && !showAiAgents ? (
          <p {...stylex.props(shellStyles.settingsSearchEmpty)}>
            No settings found
          </p>
        ) : null}
      </Sidebar.Content>
    </>
  );
}
