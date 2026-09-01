import { Sidebar, type SidebarItemProps } from "@lenso/ui/sidebar";
import * as stylex from "@stylexjs/stylex";
import type { PropsWithChildren, ReactNode } from "react";

import { contextNavigationStyles as styles } from "./context-navigation.stylex";

export function ContextNavigationItem({
  selected,
  xstyle,
  ...props
}: SidebarItemProps) {
  return (
    <Sidebar.Item
      {...props}
      {...(selected === undefined ? {} : { selected })}
      xstyle={[styles.item, selected && styles.itemSelected, xstyle]}
    />
  );
}

export function ContextNavigationHeader({
  children,
  title,
}: PropsWithChildren<{ title: ReactNode }>) {
  return (
    <Sidebar.Header xstyle={styles.header}>
      <strong {...stylex.props(styles.title)}>{title}</strong>
      <Sidebar.HeaderSpacer />
      {children}
    </Sidebar.Header>
  );
}

export function ContextNavigationSection({
  children,
  label,
}: PropsWithChildren<{ label: ReactNode }>) {
  return (
    <Sidebar.Section xstyle={styles.section}>
      <Sidebar.SectionHeader xstyle={styles.sectionHeader}>
        <Sidebar.SectionLabel xstyle={styles.sectionLabel}>
          {label}
        </Sidebar.SectionLabel>
      </Sidebar.SectionHeader>
      {children}
    </Sidebar.Section>
  );
}
