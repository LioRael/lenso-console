import { Avatar } from "@lenso/ui/avatar";
import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  Bot,
  ChevronLeft,
  History,
  MousePointer2,
  PanelLeft,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useState, type ComponentType, type PropsWithChildren } from "react";

import { AgentHistoryMenu } from "../../features/agent/agent-history-menu";
import { AgentQuickPanel } from "../../features/agent/agent-quick-panel";

import styles from "./console-shell.module.css";

type NavigationItem = {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  matchPaths: readonly string[];
  path: string;
};

const primaryNavigation: readonly NavigationItem[] = [
  {
    icon: MousePointer2,
    label: "Agent",
    matchPaths: ["/", "/agent"],
    path: "/",
  },
  {
    icon: Blocks,
    label: "Plugins",
    matchPaths: ["/plugins"],
    path: "/plugins",
  },
];

export function ConsoleShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const settingsOpen = currentPath.startsWith("/settings");

  return (
    <ThemeScope className={styles.theme} theme="system">
      <Sidebar.Group className={styles.shell}>
        <Sidebar.Root
          className={styles.sidebar}
          data-mobile-open={mobileNavigationOpen || undefined}
          defaultOpen
          id="console-sidebar"
        >
          <Sidebar.Panel aria-label="Console navigation">
            {settingsOpen ? (
              <SettingsSidebar
                currentPath={currentPath}
                navigate={(to) => {
                  setMobileNavigationOpen(false);
                  navigate({ to });
                }}
              />
            ) : (
              <>
                <Sidebar.Header>
                  <Sidebar.Workspace icon="L">Lenso</Sidebar.Workspace>
                </Sidebar.Header>
                <Sidebar.Content>
                  <Sidebar.Menu aria-label="Primary navigation">
                    {primaryNavigation.map((item) => {
                      const Icon = item.icon;
                      const selected = item.matchPaths.some((path) =>
                        path === "/"
                          ? currentPath === path
                          : currentPath.startsWith(path)
                      );
                      return (
                        <Sidebar.MenuItem key={item.path}>
                          <Sidebar.Item
                            icon={<Icon size={15} strokeWidth={1.75} />}
                            onClick={() => {
                              setMobileNavigationOpen(false);
                              navigate({ to: item.path });
                            }}
                            selected={selected}
                          >
                            {item.label}
                          </Sidebar.Item>
                        </Sidebar.MenuItem>
                      );
                    })}
                  </Sidebar.Menu>
                  <Sidebar.Section>
                    <Sidebar.SectionHeader>
                      <Sidebar.SectionLabel>Workspace</Sidebar.SectionLabel>
                    </Sidebar.SectionHeader>
                    <Sidebar.Menu>
                      <Sidebar.MenuItem>
                        <Sidebar.Item
                          icon={<Settings size={15} strokeWidth={1.75} />}
                          onClick={() => {
                            setMobileNavigationOpen(false);
                            navigate({ to: "/settings" });
                          }}
                        >
                          Settings
                        </Sidebar.Item>
                      </Sidebar.MenuItem>
                    </Sidebar.Menu>
                  </Sidebar.Section>
                </Sidebar.Content>
                <Sidebar.Footer>
                  <div className={styles.operator}>
                    <Avatar.Root size="compact">
                      <Avatar.Fallback>LO</Avatar.Fallback>
                      <Avatar.Status
                        aria-label="Connected"
                        attached
                        state="online"
                      />
                    </Avatar.Root>
                    <span className={styles.operatorCopy}>
                      <span className={styles.operatorName}>
                        Local operator
                      </span>
                      <span className={styles.operatorRole}>
                        Local workspace
                      </span>
                    </span>
                  </div>
                </Sidebar.Footer>
              </>
            )}
          </Sidebar.Panel>
        </Sidebar.Root>

        <main className={styles.main}>{children}</main>

        <IconButton
          aria-label={
            mobileNavigationOpen ? "Close navigation" : "Open navigation"
          }
          className={styles.mobileMenuTrigger}
          data-open={mobileNavigationOpen || undefined}
          data-settings={currentPath.startsWith("/settings") || undefined}
          onClick={() => setMobileNavigationOpen((open) => !open)}
          size="compact"
          variant="ghost"
        >
          {mobileNavigationOpen ? (
            <X aria-hidden="true" size={14} strokeWidth={1.7} />
          ) : (
            <PanelLeft aria-hidden="true" size={14} strokeWidth={1.7} />
          )}
        </IconButton>
        {mobileNavigationOpen ? (
          <button
            aria-label="Close navigation"
            className={styles.mobileBackdrop}
            onClick={() => setMobileNavigationOpen(false)}
            type="button"
          />
        ) : null}

        <footer aria-label="Application utilities" className={styles.utilities}>
          <AgentQuickPanel
            onOpenFullPage={() =>
              navigate({
                params: { chatId: "support-desk" },
                to: "/agent/$chatId",
              })
            }
          />
          <AgentHistoryMenu>
            <IconButton
              aria-label="Chat history"
              data-agent-action="history"
              size="default"
              variant="ghost"
            >
              <History aria-hidden="true" size={14} strokeWidth={1.6} />
            </IconButton>
          </AgentHistoryMenu>
        </footer>
      </Sidebar.Group>
    </ThemeScope>
  );
}

function SettingsSidebar({
  currentPath,
  navigate,
}: {
  currentPath: string;
  navigate: (
    to: "/" | "/settings" | "/settings/agent" | "/settings/ai"
  ) => void;
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
      <Sidebar.Header className={styles.settingsSidebarHeader}>
        <Button
          className={styles.settingsBack}
          onClick={() => navigate("/")}
          size="compact"
          variant="ghost"
        >
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.7} />
          Back to app
        </Button>
      </Sidebar.Header>
      <Sidebar.Content className={styles.settingsSidebarContent}>
        <label className={styles.settingsSearch}>
          <Search aria-hidden="true" size={14} strokeWidth={1.7} />
          <input
            aria-label="Search settings"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            value={query}
          />
        </label>
        {showPreferences || showPersonalization ? (
          <Sidebar.Section>
            <Sidebar.SectionHeader>
              <Sidebar.SectionLabel>Personal</Sidebar.SectionLabel>
            </Sidebar.SectionHeader>
            <Sidebar.Menu>
              {showPreferences ? (
                <Sidebar.MenuItem>
                  <Sidebar.Item
                    icon={<SlidersHorizontal size={14} strokeWidth={1.7} />}
                    onClick={() => navigate("/settings")}
                    selected={
                      currentPath === "/settings" ||
                      currentPath === "/settings/appearance"
                    }
                  >
                    Preferences
                  </Sidebar.Item>
                </Sidebar.MenuItem>
              ) : null}
              {showPersonalization ? (
                <Sidebar.MenuItem>
                  <Sidebar.Item
                    icon={<Bot size={14} strokeWidth={1.7} />}
                    onClick={() => navigate("/settings/agent")}
                    selected={currentPath.startsWith("/settings/agent")}
                  >
                    Agent personalization
                  </Sidebar.Item>
                </Sidebar.MenuItem>
              ) : null}
            </Sidebar.Menu>
          </Sidebar.Section>
        ) : null}
        {showAiAgents ? (
          <Sidebar.Section>
            <Sidebar.SectionHeader>
              <Sidebar.SectionLabel>Features</Sidebar.SectionLabel>
            </Sidebar.SectionHeader>
            <Sidebar.Menu>
              <Sidebar.MenuItem>
                <Sidebar.Item
                  icon={<Sparkles size={14} strokeWidth={1.7} />}
                  onClick={() => navigate("/settings/ai")}
                  selected={currentPath.startsWith("/settings/ai")}
                >
                  AI &amp; Agents
                </Sidebar.Item>
              </Sidebar.MenuItem>
            </Sidebar.Menu>
          </Sidebar.Section>
        ) : null}
        {!showPreferences && !showPersonalization && !showAiAgents ? (
          <p className={styles.settingsSearchEmpty}>No settings found</p>
        ) : null}
      </Sidebar.Content>
    </>
  );
}
