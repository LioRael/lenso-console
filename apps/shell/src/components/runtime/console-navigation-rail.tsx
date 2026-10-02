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
}: {
  destinations: readonly ConsoleDestination[];
  onSignOut: (() => Promise<void>) | undefined;
}) {
  const t = useConsoleTranslation();
  const appearance = useConsoleAppearance();
  const top = destinations.filter((item) => item.id !== "settings");
  const settings = destinations.find((item) => item.id === "settings");
  return (
    <nav aria-label={t("Console areas")} {...stylex.props(styles.rail)}>
      <div {...stylex.props(styles.railTop)}>
        {top.map((item) => (
          <RailItem key={item.id} item={item}>
            {item.id === "system" ? (
              <Blocks size={20} />
            ) : item.id === "management" ? (
              <ShieldCheck size={20} />
            ) : item.id.startsWith("agent:") ? (
              <Sparkles size={20} />
            ) : item.id.includes(":welcome:") ? (
              <House size={20} />
            ) : item.id.includes(":projects:") ? (
              <Folder size={20} />
            ) : item.id.includes(":artifacts:") ? (
              <LayoutGrid size={20} />
            ) : item.id.includes(":apps:") ? (
              <Boxes size={20} />
            ) : (
              <PanelsTopLeft size={20} />
            )}
          </RailItem>
        ))}
      </div>
      <div {...stylex.props(styles.railBottom)}>
        <Menu.Root>
          <Menu.Trigger
            render={
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label={t("Color mode")}
              />
            }
          >
            {appearance.preference === "system" ? (
              <Monitor size={18} />
            ) : appearance.theme === "dark" ? (
              <Moon size={18} />
            ) : (
              <Sun size={18} />
            )}
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
        {settings ? (
          <RailItem item={settings}>
            <Settings size={20} />
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
            <LogOut size={20} />
          </RailItem>
        ) : null}
      </div>
    </nav>
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
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Button
            isIconOnly
            nativeButton={!item.route}
            role={item.route ? "link" : undefined}
            size="sm"
            variant="ghost"
            aria-label={item.label}
            aria-current={item.selected ? "page" : undefined}
            render={item.route ? <Link {...item.route} /> : undefined}
            onClick={item.route ? undefined : () => item.onSelect()}
            xstyle={[styles.railItem, item.selected && styles.railItemSelected]}
          />
        }
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="right">
          <Tooltip.Popup>{item.label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
