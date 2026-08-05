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
  pageClassName,
  title,
}: PropsWithChildren<{
  description: string;
  meta?: ReactNode;
  pageClassName?: string;
  title: string;
}>) {
  return (
    <ConsolePage
      className={`product-page${pageClassName ? ` ${pageClassName}` : ""}`}
    >
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>{title}</ConsolePage.Title>
          <ConsolePage.Description>{description}</ConsolePage.Description>
        </ConsolePage.Heading>
        {meta ? <ConsolePage.Actions>{meta}</ConsolePage.Actions> : null}
      </ConsolePage.Header>
      <ConsolePage.Body className="product-page__body">
        {children}
      </ConsolePage.Body>
    </ConsolePage>
  );
}

export function ProductTabs({
  active,
  className,
  items,
  onChange,
}: {
  active: string;
  className?: string;
  items: readonly string[];
  onChange: (item: string) => void;
}) {
  return (
    <Tabs className={className} density="page" inset="none">
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
  className,
  children,
  inspector,
  inspectorWidth = 376,
}: PropsWithChildren<{
  className?: string;
  inspector: ReactNode;
  inspectorWidth?: number;
}>) {
  return (
    <SplitView
      className={
        className
          ? `product-split-workspace ${className}`
          : "product-split-workspace"
      }
      inset="default"
      inspectorWidth={inspectorWidth}
    >
      <SplitView.Main>{children}</SplitView.Main>
      <SplitView.Inspector>{inspector}</SplitView.Inspector>
    </SplitView>
  );
}

export function Inspector({
  className,
  children,
  headerAction,
  status,
  subtitle,
  title,
}: PropsWithChildren<{
  className?: string;
  headerAction?: ReactNode;
  status?: ReactNode;
  subtitle?: string;
  title: string;
}>) {
  return (
    <ConsoleInspector
      className={className ?? "product-inspector"}
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
