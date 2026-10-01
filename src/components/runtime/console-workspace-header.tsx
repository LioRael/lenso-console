import { Button } from "@lenso/ui/button";
import { Menu } from "@lenso/ui/menu";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Command, PanelsTopLeft, X } from "lucide-react";

import { useConsoleTranslation } from "../../app/console-i18n";
import type { ConsoleDestination } from "./console-navigation-model";
import { shellStyles as styles } from "./console-shell.stylex";

export function ConsoleWorkspaceHeader({
  title,
  subtitle,
  destinations,
  onClose,
  onSearch,
}: {
  title: string;
  subtitle: string;
  destinations: readonly ConsoleDestination[];
  onClose: () => void;
  onSearch: () => void;
}) {
  const t = useConsoleTranslation();
  return (
    <div {...stylex.props(styles.sidebarHeader)}>
      <span aria-hidden="true" {...stylex.props(styles.sidebarMark)}>
        <PanelsTopLeft size={20} />
      </span>
      <div {...stylex.props(styles.sidebarIdentity)}>
        <strong title={title} {...stylex.props(styles.sidebarTitle)}>
          {title}
        </strong>
        <span title={subtitle} {...stylex.props(styles.sidebarSubtitle)}>
          {subtitle}
        </span>
      </div>
      <div {...stylex.props(styles.sidebarHeaderActions)}>
        <Menu.Root>
          <Menu.Trigger
            render={
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`${t("Workspace")}: ${title}`}
              />
            }
          >
            <ChevronsUpDown aria-hidden="true" size={16} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="start">
              <Menu.Popup aria-label={t("Workspaces")}>
                {destinations.map((item) => (
                  <Menu.Item
                    key={item.id}
                    render={item.route ? <Link {...item.route} /> : undefined}
                    onClick={item.route ? undefined : () => item.onSelect()}
                  >
                    <Menu.Item.Label>{item.label}</Menu.Item.Label>
                    {item.selected ? (
                      <Check aria-hidden="true" size={14} />
                    ) : null}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <span
          aria-hidden="true"
          {...stylex.props(styles.sidebarHeaderActionDivider)}
        />
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t("Search workspaces and pages…")}
          onClick={onSearch}
          xstyle={styles.workspaceSearchShortcut}
        >
          <Command aria-hidden="true" size={15} />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t("Close workspace navigation")}
          onClick={onClose}
          xstyle={styles.mobileOnly}
        >
          <X aria-hidden="true" size={16} />
        </Button>
      </div>
    </div>
  );
}
