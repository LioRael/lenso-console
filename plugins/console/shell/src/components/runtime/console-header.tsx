import { Sidebar } from "@lenso/primitives/sidebar";
import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import {
  ConsoleSearch,
  type ConsoleSearchItem,
  type ConsoleSearchHandle,
} from "./console-search";
import { shellStyles as styles } from "./console-shell.stylex";
import type { ConsoleNavigationState } from "./use-console-navigation";

export function ConsoleHeader({
  navigation,
  title,
  contextLabel,
  searchItems,
  searchRef,
  actions,
}: {
  navigation: ConsoleNavigationState;
  title: string;
  contextLabel: string;
  searchItems: readonly ConsoleSearchItem[];
  searchRef: Ref<ConsoleSearchHandle>;
  actions?: ReactNode;
}) {
  const t = useConsoleTranslation();
  const navigationOpen = navigation.narrow
    ? navigation.mobileOpen
    : !navigation.collapsed;
  return (
    <header
      aria-label={t("Console toolbar")}
      inert={navigation.mobileOpen}
      {...stylex.props(styles.header)}
    >
      <div {...stylex.props(styles.toolbarLeading)}>
        <span {...stylex.props(styles.toolbarBrand)}>Lenso</span>
        <Sidebar.Trigger
          targetId="console-sidebar"
          render={
            <Button
              isIconOnly
              variant="ghost"
              size="md"
              xstyle={[styles.mobileNavTrigger, styles.toolbarNavigationAction]}
            />
          }
          ref={navigation.triggerRef}
          aria-label={t(
            navigationOpen
              ? "Close workspace navigation"
              : "Open workspace navigation"
          )}
        >
          {navigationOpen ? (
            <PanelLeftClose aria-hidden="true" size={16} />
          ) : (
            <PanelLeftOpen aria-hidden="true" size={16} />
          )}
        </Sidebar.Trigger>
      </div>
      <div {...stylex.props(styles.toolbarCenter)}>
        <ConsoleSearch
          ref={searchRef}
          items={searchItems}
          label={`${contextLabel} / ${title}`}
        />
      </div>
      <div {...stylex.props(styles.toolbarActions)}>{actions}</div>
    </header>
  );
}
