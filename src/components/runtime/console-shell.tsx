import { Avatar } from "@lenso/ui/avatar";
import { Button } from "@lenso/ui/button";
import { Sidebar } from "@lenso/ui/sidebar";
import { StatusMarker } from "@lenso/ui/status-marker";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Blocks, Boxes, House, Plug, ServerCog, Settings } from "lucide-react";
import type { ComponentType, PropsWithChildren } from "react";

import styles from "./console-shell.module.css";

type NavigationItem = {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  path: string;
};

const primaryNavigation: readonly NavigationItem[] = [
  { icon: House, label: "Overview", path: "/" },
  { icon: Plug, label: "Plugins", path: "/plugins" },
  { icon: Blocks, label: "Modules", path: "/modules" },
  { icon: ServerCog, label: "Services", path: "/services" },
  { icon: Boxes, label: "Stories", path: "/stories" },
];

export function ConsoleShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });

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
                  const selected =
                    item.path === "/"
                      ? currentPath === "/"
                      : currentPath.startsWith(item.path);
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

        <main className={styles.main}>{children}</main>

        <footer aria-label="Application utilities" className={styles.utilities}>
          <StatusMarker presentation="label" status="success">
            Local environment
          </StatusMarker>
          <Button
            onClick={() => navigate({ to: "/settings" })}
            size="compact"
            variant="ghost"
          >
            Settings
          </Button>
        </footer>
      </Sidebar.Group>
    </ThemeScope>
  );
}
