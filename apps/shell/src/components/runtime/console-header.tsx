import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  SquarePen,
} from "lucide-react";
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
  const router = useRouter();
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
        <span aria-hidden="true" {...stylex.props(styles.toolbarMark)}>
          <PanelsTopLeft size={16} />
        </span>
        <div {...stylex.props(styles.toolbarNavigation)}>
          <Button
            isIconOnly
            variant="ghost"
            size="md"
            ref={navigation.triggerRef}
            aria-controls="console-sidebar"
            aria-expanded={navigationOpen}
            aria-label={t(
              navigationOpen
                ? "Close workspace navigation"
                : "Open workspace navigation"
            )}
            onClick={() => navigation.toggle()}
            xstyle={[styles.mobileNavTrigger, styles.toolbarNavigationAction]}
          >
            {navigationOpen ? (
              <PanelLeftClose aria-hidden="true" size={16} />
            ) : (
              <PanelLeftOpen aria-hidden="true" size={16} />
            )}
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            size="md"
            aria-label={t("Back")}
            xstyle={styles.toolbarNavigationAction}
            disabled={!router.history.canGoBack()}
            onClick={() => router.history.back()}
          >
            <ArrowLeft aria-hidden="true" size={16} />
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            size="md"
            aria-label={t("Forward")}
            xstyle={styles.toolbarNavigationAction}
            disabled={
              (router.history.location.state.__TSR_index ?? 0) >=
              router.history.length - 1
            }
            onClick={() => router.history.forward()}
          >
            <ArrowRight aria-hidden="true" size={16} />
          </Button>
        </div>
      </div>
      <div {...stylex.props(styles.toolbarCenter)}>
        <div {...stylex.props(styles.toolbarAddress)}>
          <span
            aria-hidden="true"
            {...stylex.props(styles.toolbarMark, styles.addressMark)}
          >
            <PanelsTopLeft size={16} />
          </span>
          <SquarePen
            aria-hidden="true"
            size={16}
            {...stylex.props(styles.addressPageIcon)}
          />
          <ConsoleSearch
            ref={searchRef}
            items={searchItems}
            label={`${contextLabel} / ${title}`}
          />
        </div>
      </div>
      <div {...stylex.props(styles.toolbarActions)}>{actions}</div>
    </header>
  );
}
