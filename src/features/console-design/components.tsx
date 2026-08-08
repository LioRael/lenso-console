import {
  ConsolePage,
  FilterControl,
  InlineStatus,
  Inspector as ConsoleInspector,
  SplitView,
  Tabs,
  type SemanticTone,
} from "@lenso/console-ui";
import { ChevronDown } from "lucide-react";
import {
  useState,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";

export function ProductPage({
  children,
  description,
  meta,
  pageKind,
  title,
}: PropsWithChildren<{
  description: string;
  meta?: ReactNode;
  pageKind?: string;
  title: string;
}>) {
  return (
    <ConsolePage data-page={`product-page${pageKind ? ` ${pageKind}` : ""}`}>
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>{title}</ConsolePage.Title>
          <ConsolePage.Description>{description}</ConsolePage.Description>
        </ConsolePage.Heading>
        {meta ? <ConsolePage.Actions>{meta}</ConsolePage.Actions> : null}
      </ConsolePage.Header>
      <ConsolePage.Body data-page-slot="product-page__body">
        {children}
      </ConsolePage.Body>
    </ConsolePage>
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
    <Tabs data-page-slot={pageSlot} density="page" inset="none">
      <Tabs.List inset="none">
        {items.map((item) => (
          <Tabs.Tab
            aria-label={item}
            key={item}
            onClick={() => onChange(item)}
            selected={active === item}
          >
            {item}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

export function FilterButton({
  children,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <FilterControl
      {...props}
      icon={<ChevronDown size={12} strokeWidth={1.5} />}
    >
      {children}
    </FilterControl>
  );
}

export function StatusDot({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  const semanticTone: SemanticTone = tone === "error" ? "danger" : tone;
  return <InlineStatus tone={semanticTone}>{label}</InlineStatus>;
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
    <SplitView
      data-page-slot={`product-split-workspace${pageSlot ? ` ${pageSlot}` : ""}`}
      inset="default"
      inspectorWidth={inspectorWidth}
    >
      <SplitView.Main>{children}</SplitView.Main>
      <SplitView.Inspector>{inspector}</SplitView.Inspector>
    </SplitView>
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
    <ConsoleInspector
      data-page-slot={`product-inspector${pageSlot ? ` ${pageSlot}` : ""}`}
      headerAction={headerAction}
      status={status}
      subtitle={subtitle}
      title={title}
    >
      {children}
    </ConsoleInspector>
  );
}

export function InspectorSection({
  children,
  title,
}: PropsWithChildren<{ title: string }>) {
  return (
    <ConsoleInspector.Section title={title}>
      {children}
    </ConsoleInspector.Section>
  );
}

export function useSelection<T>(items: readonly T[]) {
  return useState<T>(items[0]!);
}
