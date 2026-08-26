import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { Button } from "@lenso/ui/button";
import { PageHeader } from "@lenso/ui/page-header";
import { StatusMarker } from "@lenso/ui/status-marker";
import { Tabs } from "@lenso/ui/tabs";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Boxes, ChevronDown } from "lucide-react";
import {
  useState,
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100%",
    minWidth: 0,
    overflow: "hidden",
    width: "100%",
  },
  header: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flex: "0 0 auto",
    height: 44,
  },
  visuallyHidden: {
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  body: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  tabs: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flex: "0 0 41px",
    paddingBlock: 6,
    paddingInline: 8,
  },
  split: {
    display: "grid",
    flex: "1 1 auto",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    "@media (max-width: 1000px)": {
      gridTemplateColumns: "minmax(0, 1fr) !important",
      overflow: "auto",
    },
  },
  splitMain: {
    minHeight: 0,
    minWidth: 0,
    overflow: "auto",
  },
  splitInspector: {
    borderInlineStartColor: tokens.colorBorderTertiary,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "auto",
    "@media (max-width: 1000px)": {
      borderBlockStartColor: tokens.colorBorderTertiary,
      borderBlockStartStyle: "solid",
      borderBlockStartWidth: 1,
      borderInlineStartStyle: "none",
    },
  },
  inspector: {
    color: tokens.colorContentSecondary,
    fontSize: 12,
    lineHeight: "18px",
    minHeight: "100%",
    minWidth: 0,
  },
  inspectorHeader: {
    alignItems: "center",
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: tokens.space3,
    justifyContent: "space-between",
    minHeight: 58,
    paddingBlock: 8,
    paddingInline: 14,
  },
  inspectorCopy: {
    display: "grid",
    gap: 1,
    minWidth: 0,
  },
  inspectorTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: "18px",
    margin: 0,
  },
  inspectorSubtitle: {
    color: tokens.colorContentTertiary,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    lineHeight: "16px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  inspectorStatus: {
    marginInlineStart: "auto",
  },
  inspectorBody: {
    display: "grid",
  },
  inspectorSection: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: tokens.space2,
    paddingBlock: tokens.space3,
    paddingInline: 14,
  },
  inspectorSectionTitle: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: "16px",
    margin: 0,
  },
  filterButtonContent: {
    alignItems: "center",
    display: "inline-flex",
    gap: tokens.space2,
  },
});

export function ProductPage({
  children,
  pageKind,
  title,
}: PropsWithChildren<{
  description: string;
  meta?: ReactNode;
  pageKind?: string;
  title: string;
}>) {
  return (
    <div
      data-page={`product-page${pageKind ? ` ${pageKind}` : ""}`}
      {...stylex.props(styles.page)}
    >
      <PageHeader.Root
        aria-label={`${title} navigation`}
        data-ui="page__header"
        variant="team"
        {...stylex.props(styles.header)}
      >
        <PageHeader.Row>
          <Breadcrumb.Root aria-label={`${title} breadcrumb`}>
            <Breadcrumb.List>
              <Breadcrumb.Item>
                <Breadcrumb.Link nativeButton={false} render={<Link to="/" />}>
                  <Breadcrumb.Icon>
                    <Boxes size={14} strokeWidth={1.75} />
                  </Breadcrumb.Icon>
                  System
                </Breadcrumb.Link>
              </Breadcrumb.Item>
              <Breadcrumb.Separator />
              <Breadcrumb.Item>
                <Breadcrumb.Page>{title}</Breadcrumb.Page>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb.Root>
        </PageHeader.Row>
      </PageHeader.Root>
      <h1 {...stylex.props(styles.visuallyHidden)}>{title}</h1>
      <div data-page-slot="product-page__body" {...stylex.props(styles.body)}>
        {children}
      </div>
    </div>
  );
}

export function ProductTabs({
  active,
  pageSlot,
  items,
  onChange,
}: {
  active: string;
  pageSlot?: string;
  items: readonly string[];
  onChange: (item: string) => void;
}) {
  return (
    <Tabs.Root
      data-page-slot={pageSlot}
      onValueChange={(value) => onChange(String(value))}
      value={active}
      {...stylex.props(styles.tabs)}
    >
      <Tabs.List data-ui="tabs__list">
        {items.map((item) => (
          <Tabs.Tab
            aria-label={item}
            data-ui="tabs__tab"
            key={item}
            value={item}
          >
            {item}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

export function FilterButton({
  children,
  ...props
}: PropsWithChildren<ComponentProps<typeof Button>>) {
  return (
    <Button {...props} size="compact" variant="secondary">
      <span {...stylex.props(styles.filterButtonContent)}>
        {children}
        <ChevronDown aria-hidden="true" size={12} strokeWidth={1.5} />
      </span>
    </Button>
  );
}

export function StatusDot({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  return (
    <StatusMarker
      data-tone={tone === "error" ? "danger" : tone}
      data-ui="inline-status"
      presentation="label"
      status={tone}
    >
      {label}
    </StatusMarker>
  );
}

export function SplitWorkspace({
  pageSlot,
  children,
  inspector,
  inspectorWidth = 376,
}: PropsWithChildren<{
  pageSlot?: string;
  inspector: ReactNode;
  inspectorWidth?: number;
}>) {
  return (
    <div
      data-page-slot={`product-split-workspace${pageSlot ? ` ${pageSlot}` : ""}`}
      style={{ gridTemplateColumns: `minmax(0, 1fr) ${inspectorWidth}px` }}
      {...stylex.props(styles.split)}
    >
      <main data-ui="split-view__main" {...stylex.props(styles.splitMain)}>
        {children}
      </main>
      <aside {...stylex.props(styles.splitInspector)}>{inspector}</aside>
    </div>
  );
}

export function Inspector({
  pageSlot,
  children,
  headerAction,
  status,
  subtitle,
  title,
}: PropsWithChildren<{
  pageSlot?: string;
  headerAction?: ReactNode;
  status?: ReactNode;
  subtitle?: string;
  title: string;
}>) {
  return (
    <section
      data-page-slot={`product-inspector${pageSlot ? ` ${pageSlot}` : ""}`}
      {...stylex.props(styles.inspector)}
    >
      <header
        data-ui="inspector__header"
        {...stylex.props(styles.inspectorHeader)}
      >
        <div {...stylex.props(styles.inspectorCopy)}>
          <h2 {...stylex.props(styles.inspectorTitle)}>{title}</h2>
          {subtitle ? (
            <span {...stylex.props(styles.inspectorSubtitle)}>{subtitle}</span>
          ) : null}
          {status ? (
            <div {...stylex.props(styles.inspectorStatus)}>{status}</div>
          ) : null}
        </div>
        {headerAction ? (
          <div data-ui="inspector__header-action">{headerAction}</div>
        ) : null}
      </header>
      <div {...stylex.props(styles.inspectorBody)}>{children}</div>
    </section>
  );
}

export function InspectorSection({
  children,
  title,
}: PropsWithChildren<{ title: string }>) {
  return (
    <section {...stylex.props(styles.inspectorSection)}>
      <h3 {...stylex.props(styles.inspectorSectionTitle)}>{title}</h3>
      {children}
    </section>
  );
}

export function useSelection<T>(items: readonly T[]) {
  return useState<T>(items[0]!);
}
