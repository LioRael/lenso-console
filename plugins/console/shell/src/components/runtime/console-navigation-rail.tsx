import { Sidebar } from "@lenso/primitives/sidebar";
import { Button } from "@lenso/ui/button";
import { Menu } from "@lenso/ui/menu";
import { Tooltip } from "@lenso/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import {
  Blocks,
  Boxes,
  Folder,
  LayoutGrid,
  House,
  LogOut,
  Monitor,
  Moon,
  PanelsTopLeft,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import type { ReactNode } from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { useConsoleTranslation } from "../../app/console-i18n";
import type { ConsoleDestination } from "./console-navigation-model";
import { shellStyles as styles } from "./console-shell.stylex";

export function ConsoleNavigationRail({
  destinations,
  onSignOut,
  onClose,
}: {
  destinations: readonly ConsoleDestination[];
  onSignOut: (() => Promise<void>) | undefined;
  onClose: (() => void) | undefined;
}) {
  const t = useConsoleTranslation();
  const appearance = useConsoleAppearance();
  const top = destinations.filter((item) => item.id !== "settings");
  const settings = destinations.find((item) => item.id === "settings");
  return (
    <Sidebar.Root
      open
      onOpenChange={() => onClose?.()}
      {...stylex.props(styles.railRoot)}
    >
      <Sidebar.Panel
        render={<nav />}
        aria-label={t("Console areas")}
        {...stylex.props(styles.rail)}
      >
        <Sidebar.Content {...stylex.props(styles.railContent)}>
          <Sidebar.Menu {...stylex.props(styles.railTop)}>
            {top.map((item) => (
              <RailItem key={item.id} item={item}>
                {item.id === "system" ? (
                  <Blocks />
                ) : item.id === "management" ? (
                  <ShieldCheck />
                ) : item.id.startsWith("agent:") ? (
                  <Sparkles />
                ) : item.id.includes(":welcome:") ? (
                  <House />
                ) : item.id.includes(":projects:") ? (
                  <Folder />
                ) : item.id.includes(":artifacts:") ? (
                  <LayoutGrid />
                ) : item.id.includes(":apps:") ? (
                  <Boxes />
                ) : (
                  <PanelsTopLeft />
                )}
              </RailItem>
            ))}
          </Sidebar.Menu>
        </Sidebar.Content>
        <Sidebar.Footer {...stylex.props(styles.railBottom)}>
          <Sidebar.Menu {...stylex.props(styles.railFooterMenu)}>
            <Sidebar.MenuItem {...stylex.props(styles.railMenuItem)}>
              <Menu.Root>
                <Menu.Trigger
                  render={
                    <Button
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      aria-label={t("Color mode")}
                      xstyle={styles.railItem}
                    />
                  }
                >
                  <Button.Icon>
                    {appearance.preference === "system" ? (
                      <Monitor />
                    ) : appearance.theme === "dark" ? (
                      <Moon />
                    ) : (
                      <Sun />
                    )}
                  </Button.Icon>
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner side="right" align="end">
                    <Menu.Popup aria-label={t("Color mode")}>
                      {(["system", "light", "dark"] as const).map((value) => (
                        <Menu.Item
                          key={value}
                          onClick={() => appearance.setPreference(value)}
                        >
                          <Menu.Item.Label>
                            {t(
                              value === "system"
                                ? "System"
                                : value === "light"
                                  ? "Light"
                                  : "Dark"
                            )}
                          </Menu.Item.Label>
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </Sidebar.MenuItem>
            {settings ? (
              <RailItem item={settings}>
                <Settings />
              </RailItem>
            ) : null}
            {onSignOut ? (
              <RailItem
                item={{
                  id: "sign-out",
                  label: t("Sign out"),
                  group: "",
                  onSelect: () => {
                    void onSignOut();
                  },
                }}
              >
                <LogOut />
              </RailItem>
            ) : null}
          </Sidebar.Menu>
        </Sidebar.Footer>
      </Sidebar.Panel>
    </Sidebar.Root>
  );
}

function RailItem({
  item,
  children,
}: {
  item: ConsoleDestination;
  children: ReactNode;
}) {
  return (
    <Sidebar.MenuItem {...stylex.props(styles.railMenuItem)}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Sidebar.Item
              selected={item.selected ?? false}
              render={
                <Button
                  isIconOnly
                  nativeButton={!item.route}
                  role={item.route ? "link" : undefined}
                  size="sm"
                  variant="ghost"
                  aria-label={item.label}
                  render={item.route ? <Link {...item.route} /> : undefined}
                  onClick={item.route ? undefined : () => item.onSelect()}
                  xstyle={[
                    styles.railItem,
                    item.selected && styles.railItemSelected,
                  ]}
                />
              }
            />
          }
        >
          <Button.Icon>{children}</Button.Icon>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner side="right">
            <Tooltip.Popup>{item.label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Sidebar.MenuItem>
  );
}
