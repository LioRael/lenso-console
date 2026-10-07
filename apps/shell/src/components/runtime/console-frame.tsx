import { Sidebar } from "@lenso/primitives/sidebar";
import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { shellStyles as styles } from "./console-shell.stylex";
import type { ConsoleNavigationState } from "./use-console-navigation";

export function ConsoleFrame({
  navigation,
  toolbar,
  rail,
  sidebar,
  title,
  children,
}: {
  navigation: ConsoleNavigationState;
  toolbar: ReactNode;
  rail: ReactNode;
  sidebar: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const t = useConsoleTranslation();
  return (
    <Sidebar.Group
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
          open={
            navigation.narrow ? navigation.mobileOpen : !navigation.collapsed
          }
          onOpenChange={navigation.handleOpenChange}
          data-mobile-open={navigation.mobileOpen || undefined}
          inert={navigation.collapsed && !navigation.mobileOpen}
          {...stylex.props(
            styles.contextSidebarRoot,
            navigation.collapsed && styles.contextSidebarCollapsed
          )}
        >
          <Sidebar.Panel
            aria-label={t("Console context navigation")}
            {...stylex.props(styles.contextSidebarPanel)}
          >
            <Sidebar.Header {...stylex.props(styles.contextSidebarHeader)}>
              <h2 title={title} {...stylex.props(styles.contextSidebarTitle)}>
                {title}
              </h2>
              <div {...stylex.props(styles.mobileNavigationActions)}>
                <Button
                  isIconOnly
                  size="md"
                  variant="ghost"
                  aria-label={t("Close workspace navigation")}
                  onClick={() => navigation.close()}
                >
                  <X aria-hidden="true" size={16} />
                </Button>
              </div>
            </Sidebar.Header>
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
    </Sidebar.Group>
  );
}
