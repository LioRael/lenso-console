import { Avatar } from "@lenso/ui/avatar";
import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import { IconButton } from "@lenso/ui/icon-button";
import { PageHeader } from "@lenso/ui/page-header";
import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  GitCompareArrows,
  History,
  House,
  MousePointer2,
  Settings,
} from "lucide-react";
import { useState, type ComponentType, type PropsWithChildren } from "react";

import styles from "./console-shell.module.css";

type NavigationItem = {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  matchPaths: readonly string[];
  path: string;
};

const primaryNavigation: readonly NavigationItem[] = [
  { icon: House, label: "Overview", matchPaths: ["/"], path: "/" },
  {
    icon: Boxes,
    label: "System",
    matchPaths: [
      "/system",
      "/plugins",
      "/modules",
      "/services",
      "/stories",
      "/runtime",
      "/delivery",
    ],
    path: "/system",
  },
  {
    icon: GitCompareArrows,
    label: "Changes",
    matchPaths: ["/changes"],
    path: "/changes",
  },
];

const systemSections = [
  { label: "Overview", path: "/system" },
  { label: "Plugins", path: "/plugins" },
  { label: "Surfaces", path: "/modules" },
  { label: "Services", path: "/services" },
  { label: "Executions", path: "/stories" },
  { label: "Operations", path: "/runtime" },
  { label: "Releases", path: "/delivery" },
] as const;

function systemSectionForPath(pathname: string) {
  return systemSections.find(({ path }) =>
    pathname === path ? true : pathname.startsWith(`${path}/`)
  );
}

export function ConsoleShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const [agentUtility, setAgentUtility] = useState<"agent" | "history" | null>(
    null
  );
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const systemSection = systemSectionForPath(currentPath);

  return (
    <ThemeScope className={styles.theme} theme="system">
      <Sidebar.Group className={styles.shell}>
        <Sidebar.Root
          className={styles.sidebar}
          defaultOpen
          id="console-sidebar"
        >
          <Sidebar.Panel aria-label="Console navigation">
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
                        onClick={() => navigate({ to: item.path })}
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
                      onClick={() => navigate({ to: "/settings" })}
                      selected={currentPath.startsWith("/settings")}
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
                  <span className={styles.operatorName}>Local operator</span>
                  <span className={styles.operatorRole}>System console</span>
                </span>
              </div>
            </Sidebar.Footer>
          </Sidebar.Panel>
        </Sidebar.Root>

        <main
          className={`${styles.main}${systemSection ? ` ${styles.systemMain}` : ""}`}
        >
          {systemSection ? (
            <PageHeader.Root
              aria-label="System navigation"
              className={styles.systemHeader}
              variant="team"
            >
              <PageHeader.Row>
                <Breadcrumb.Root aria-label="System breadcrumb">
                  <Breadcrumb.List>
                    <Breadcrumb.Item>
                      <Breadcrumb.Link
                        nativeButton={false}
                        render={<Link to="/system" />}
                      >
                        <Breadcrumb.Icon>
                          <Boxes size={14} strokeWidth={1.75} />
                        </Breadcrumb.Icon>
                        System
                      </Breadcrumb.Link>
                    </Breadcrumb.Item>
                    <Breadcrumb.Separator />
                    <Breadcrumb.Item>
                      <Breadcrumb.Page>{systemSection.label}</Breadcrumb.Page>
                    </Breadcrumb.Item>
                  </Breadcrumb.List>
                </Breadcrumb.Root>
              </PageHeader.Row>
              <PageHeader.TabsRoot
                onValueChange={(value) => navigate({ to: String(value) })}
                value={systemSection.path}
              >
                <PageHeader.TabsRow>
                  <PageHeader.TabsList aria-label="System sections">
                    {systemSections.map((section) => (
                      <PageHeader.Tab key={section.path} value={section.path}>
                        {section.label}
                      </PageHeader.Tab>
                    ))}
                  </PageHeader.TabsList>
                </PageHeader.TabsRow>
              </PageHeader.TabsRoot>
            </PageHeader.Root>
          ) : null}
          {systemSection ? (
            <div className={styles.systemContent}>{children}</div>
          ) : (
            children
          )}
        </main>

        <footer aria-label="Application utilities" className={styles.utilities}>
          <Button
            data-agent-action="open"
            onClick={() => setAgentUtility("agent")}
            size="compact"
            variant="ghost"
          >
            <span className={styles.agentAction}>
              <MousePointer2 aria-hidden="true" size={14} strokeWidth={1.6} />
              Agent
            </span>
          </Button>
          <IconButton
            aria-label="Agent history"
            data-agent-action="history"
            onClick={() => setAgentUtility("history")}
            size="default"
            variant="ghost"
          >
            <History aria-hidden="true" size={14} strokeWidth={1.6} />
          </IconButton>
        </footer>

        <Dialog.Root
          onOpenChange={(open) => {
            if (!open) {
              setAgentUtility(null);
            }
          }}
          open={agentUtility !== null}
        >
          <Dialog.Portal>
            <Dialog.Backdrop />
            <Dialog.Viewport>
              <Dialog.Popup>
                <Dialog.Header>
                  <Dialog.Title>
                    {agentUtility === "history" ? "Agent history" : "Agent"}
                  </Dialog.Title>
                  <Dialog.Close />
                </Dialog.Header>
                <Dialog.Body>
                  <Dialog.Description>
                    {agentUtility === "history"
                      ? "No Agent runs have been recorded in this Console session."
                      : "This System has not connected an Agent capability yet. Once connected, Agent operations will be prepared here for review."}
                  </Dialog.Description>
                </Dialog.Body>
              </Dialog.Popup>
            </Dialog.Viewport>
          </Dialog.Portal>
        </Dialog.Root>
      </Sidebar.Group>
    </ThemeScope>
  );
}
