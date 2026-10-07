import { Sidebar as PrimitiveSidebar } from "@lenso/primitives/sidebar";
import { Button, type ButtonRootProps } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import type { ComponentPropsWithRef, ReactNode } from "react";

type PartProps<Tag extends "div" | "aside" | "ul" | "li" | "span"> =
  ComponentPropsWithRef<Tag> & { xstyle?: stylex.StyleXStyles };

const styles = stylex.create({
  panel: { display: "flex", flexDirection: "column", minHeight: 0 },
  content: { flex: 1, minHeight: 0, overflowY: "auto" },
  header: { alignItems: "center", display: "flex" },
  menu: { listStyle: "none", margin: 0, padding: 0 },
  item: { justifyContent: "flex-start", width: "100%" },
});

function Section({ xstyle, ...props }: PartProps<"div">) {
  return <div {...props} {...stylex.props(xstyle)} />;
}

function Root({
  xstyle,
  ...props
}: ComponentPropsWithRef<typeof PrimitiveSidebar.Root> & {
  xstyle?: stylex.StyleXStyles;
}) {
  return <PrimitiveSidebar.Root {...props} {...stylex.props(xstyle)} />;
}

function Panel({
  xstyle,
  ...props
}: ComponentPropsWithRef<typeof PrimitiveSidebar.Panel> & {
  xstyle?: stylex.StyleXStyles;
}) {
  return (
    <PrimitiveSidebar.Panel
      {...props}
      {...stylex.props(styles.panel, xstyle)}
    />
  );
}

function Content({
  xstyle,
  ...props
}: ComponentPropsWithRef<typeof PrimitiveSidebar.Content> & {
  xstyle?: stylex.StyleXStyles;
}) {
  return (
    <PrimitiveSidebar.Content
      {...props}
      {...stylex.props(styles.content, xstyle)}
    />
  );
}

function Header({
  xstyle,
  ...props
}: ComponentPropsWithRef<typeof PrimitiveSidebar.Header> & {
  xstyle?: stylex.StyleXStyles;
}) {
  return (
    <PrimitiveSidebar.Header
      {...props}
      {...stylex.props(styles.header, xstyle)}
    />
  );
}

function Menu({
  xstyle,
  ...props
}: ComponentPropsWithRef<typeof PrimitiveSidebar.Menu> & {
  xstyle?: stylex.StyleXStyles;
}) {
  return (
    <PrimitiveSidebar.Menu {...props} {...stylex.props(styles.menu, xstyle)} />
  );
}

function MenuItem({
  xstyle,
  ...props
}: ComponentPropsWithRef<typeof PrimitiveSidebar.MenuItem> & {
  xstyle?: stylex.StyleXStyles;
}) {
  return <PrimitiveSidebar.MenuItem {...props} {...stylex.props(xstyle)} />;
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
    <PrimitiveSidebar.Item
      selected={selected ?? false}
      render={
        <Button
          variant="ghost"
          size="sm"
          {...props}
          xstyle={[styles.item, xstyle]}
        />
      }
    >
      {icon ? <Button.Icon>{icon}</Button.Icon> : null}
      {children}
    </PrimitiveSidebar.Item>
  );
}

export const Sidebar = {
  Footer: PrimitiveSidebar.Footer,
  Trigger: PrimitiveSidebar.Trigger,
  Root,
  Panel,
  Content,
  Header,
  Menu,
  MenuItem,
  Item,
  Section,
  SectionHeader: Header,
  SectionLabel,
};
