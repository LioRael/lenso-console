import { Avatar } from "@lenso/ui/avatar";
import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Blocks, Boxes, House, Plug, ServerCog, Settings } from "lucide-react";
import type { ComponentType, PropsWithChildren } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";

const styles = stylex.create({
  theme: {
    backgroundColor: tokens.colorSurfaceCanvas,
    color: tokens.colorContentPrimary,
    fontFamily: tokens.fontSans,
    minHeight: "100vh",
  },
  shell: {
    display: "grid",
    gridTemplateColumns: `${tokens.sizeSidebar} minmax(0, 1fr)`,
    minHeight: "100vh",
  },
  sidebarRoot: {
    height: "100vh",
    position: "sticky",
    top: 0,
  },
  brand: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space2,
    minWidth: 0,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: tokens.colorContentPrimary,
    borderRadius: tokens.radiusControl,
    color: tokens.colorContentInverse,
    display: "inline-flex",
    fontSize: 11,
    fontWeight: 600,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  brandName: { fontSize: 13, fontWeight: 600 },
  main: { minWidth: 0 },
  footer: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space2,
    minWidth: 0,
  },
  footerCopy: { display: "grid", lineHeight: 1.25, minWidth: 0 },
  footerName: {
    color: tokens.colorContentSecondary,
    fontSize: 12,
    fontWeight: 500,
  },
  footerRole: { color: tokens.colorContentTertiary, fontSize: 11 },
});

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
    <ThemeScope {...stylex.props(styles.theme)} theme="system">
      <div {...stylex.props(styles.shell)}>
        <Sidebar.Root defaultOpen {...stylex.props(styles.sidebarRoot)}>
          <Sidebar.Panel>
            <Sidebar.Header>
              <div {...stylex.props(styles.brand)}>
                <span aria-hidden="true" {...stylex.props(styles.brandMark)}>
                  L
                </span>
                <span {...stylex.props(styles.brandName)}>Lenso</span>
              </div>
            </Sidebar.Header>
            <Sidebar.Content>
              <Sidebar.Menu aria-label="Console navigation">
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
              <div {...stylex.props(styles.footer)}>
                <Avatar.Root size="compact">
                  <Avatar.Fallback>LO</Avatar.Fallback>
                  <Avatar.Status
                    aria-label="Connected"
                    attached
                    state="online"
                  />
                </Avatar.Root>
                <span {...stylex.props(styles.footerCopy)}>
                  <span {...stylex.props(styles.footerName)}>
                    Local operator
                  </span>
                  <span {...stylex.props(styles.footerRole)}>
                    System console
                  </span>
                </span>
              </div>
            </Sidebar.Footer>
          </Sidebar.Panel>
        </Sidebar.Root>
        <main {...stylex.props(styles.main)}>{children}</main>
      </div>
    </ThemeScope>
  );
}
