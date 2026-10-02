import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { Sidebar } from "../lenso/recipes/console-navigation";
import { shellStyles as styles } from "./console-shell.stylex";
import type { ConsoleNavigationState } from "./use-console-navigation";

export function ConsoleFrame({
  navigation,
  toolbar,
  rail,
  sidebarHeader,
  sidebar,
  children,
}: {
  navigation: ConsoleNavigationState;
  toolbar: ReactNode;
  rail: ReactNode;
  sidebarHeader: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const t = useConsoleTranslation();
  return (
    <div
      {...stylex.props(
        styles.shell,
        navigation.collapsed && styles.shellCollapsed
      )}
    >
      {toolbar}
      <div
        ref={navigation.regionRef}
        role={navigation.mobileOpen ? "dialog" : undefined}
        aria-label={t("Console navigation")}
        aria-modal={navigation.mobileOpen ? true : undefined}
        {...stylex.props(
          styles.navigationRegion,
          navigation.mobileOpen && styles.navigationRegionOpen
        )}
      >
        {rail}
        <Sidebar.Root
          id="console-sidebar"
          data-mobile-open={navigation.mobileOpen || undefined}
          inert={navigation.collapsed && !navigation.mobileOpen}
          xstyle={[
            styles.contextSidebarRoot,
            navigation.collapsed && styles.contextSidebarCollapsed,
          ]}
        >
          <Sidebar.Panel
            aria-label={t("Console context navigation")}
            xstyle={styles.contextSidebarPanel}
          >
            {sidebarHeader}
            {sidebar}
          </Sidebar.Panel>
        </Sidebar.Root>
      </div>
      {navigation.mobileOpen ? (
        <button
          aria-label={t("Close workspace navigation")}
          {...stylex.props(styles.mobileBackdrop)}
          onClick={() => navigation.close()}
          tabIndex={-1}
          type="button"
        />
      ) : null}
      <main inert={navigation.mobileOpen} {...stylex.props(styles.main)}>
        {children}
      </main>
    </div>
  );
}
