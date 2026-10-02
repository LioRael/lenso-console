import { Button, type ButtonRootProps } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import type { ComponentPropsWithRef, ReactNode } from "react";

type PartProps<Tag extends "div" | "aside" | "ul" | "li" | "span"> =
  ComponentPropsWithRef<Tag> & { xstyle?: stylex.StyleXStyles };

const styles = stylex.create({
  panel: { display: "flex", flexDirection: "column", minHeight: 0 },
  content: { flex: 1, minHeight: 0, overflowY: "auto" },
  header: { alignItems: "center", display: "flex" },
  spacer: { flex: 1 },
  menu: { listStyle: "none", margin: 0, padding: 0 },
  item: { justifyContent: "flex-start", width: "100%" },
});

function Group({ xstyle, ...props }: PartProps<"div">) {
  return <div {...props} {...stylex.props(xstyle)} />;
}

function Root({
  defaultOpen: _defaultOpen,
  ...props
}: PartProps<"div"> & { defaultOpen?: boolean }) {
  return <Group {...props} />;
}

function Panel({ xstyle, ...props }: PartProps<"aside">) {
  return <aside {...props} {...stylex.props(styles.panel, xstyle)} />;
}

function Content({ xstyle, ...props }: PartProps<"div">) {
  return <div {...props} {...stylex.props(styles.content, xstyle)} />;
}

function Header({ xstyle, ...props }: PartProps<"div">) {
  return (
    <div
      {...props}
      data-slot="sidebar-header"
      {...stylex.props(styles.header, xstyle)}
    />
  );
}

function HeaderSpacer({ xstyle, ...props }: PartProps<"div">) {
  return <div {...props} {...stylex.props(styles.spacer, xstyle)} />;
}

function Menu({ xstyle, ...props }: PartProps<"ul">) {
  return <ul {...props} {...stylex.props(styles.menu, xstyle)} />;
}

function MenuItem({ xstyle, ...props }: PartProps<"li">) {
  return <li {...props} {...stylex.props(xstyle)} />;
}

function SectionLabel({ xstyle, ...props }: PartProps<"span">) {
  return <span {...props} {...stylex.props(xstyle)} />;
}

export type SidebarItemProps = ButtonRootProps & {
  selected?: boolean;
  icon?: ReactNode;
};

function Item({
  selected,
  icon,
  children,
  xstyle,
  ...props
}: SidebarItemProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      {...props}
      aria-current={selected ? "page" : undefined}
      data-selected={selected || undefined}
      data-slot="sidebar-item"
      xstyle={[styles.item, xstyle]}
    >
      {icon ? <Button.Icon>{icon}</Button.Icon> : null}
      {children}
    </Button>
  );
}

export const Sidebar = {
  Group,
  Root,
  Panel,
  Content,
  Header,
  HeaderSpacer,
  Menu,
  MenuItem,
  Item,
  Section: Group,
  SectionHeader: Header,
  SectionLabel,
};
