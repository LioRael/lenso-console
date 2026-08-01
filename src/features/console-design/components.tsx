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
  title,
}: PropsWithChildren<{
  description: string;
  meta?: ReactNode;
  title: string;
}>) {
  return (
    <section className="product-page h-full min-h-0 overflow-auto bg-(--bg-canvas) text-(--fg-primary)">
      <div className="mx-auto min-h-full max-w-[1216px] px-10 pt-8 pb-12 max-md:px-5">
        <header className="flex min-h-16 items-start gap-6 border-b border-(--line) pb-3">
          <div className="min-w-0">
            <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.02em]">
              {title}
            </h1>
            <p className="mt-0.5 text-[14px] leading-5 text-(--fg-secondary)">
              {description}
            </p>
          </div>
          {meta ? (
            <div className="ml-auto shrink-0 pt-1 text-[12px] text-(--fg-tertiary)">
              {meta}
            </div>
          ) : null}
        </header>
        {children}
      </div>
    </section>
  );
}

export function ProductTabs({
  active,
  items,
  onChange,
}: {
  active: string;
  items: readonly string[];
  onChange: (item: string) => void;
}) {
  return (
    <div
      className="flex h-10 items-end gap-4 border-b border-(--line)"
      role="tablist"
    >
      {items.map((item) => (
        <button
          aria-selected={active === item}
          className={`relative h-10 px-1 text-[12px] transition-colors ${
            active === item
              ? "text-(--fg-primary)"
              : "text-(--fg-tertiary) hover:text-(--fg-secondary)"
          }`}
          key={item}
          onClick={() => onChange(item)}
          role="tab"
          type="button"
        >
          {item}
          {active === item ? (
            <span className="absolute right-1 bottom-0 left-1 h-px bg-(--fg-primary)" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function FilterButton({
  children,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      {...props}
      className="inline-flex h-7 items-center gap-2 rounded-[var(--radius-control)] border border-(--line-strong) bg-(--bg-control) px-2.5 text-[12px] text-(--fg-secondary) hover:bg-(--bg-control-hover) hover:text-(--fg-primary)"
      type="button"
    >
      {children}
      <span className="grid size-3 place-items-center">
        <ChevronDown size={12} strokeWidth={1.5} />
      </span>
    </button>
  );
}

export function StatusDot({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  const toneClass = {
    error: "bg-(--error)",
    neutral: "bg-(--fg-secondary)",
    success: "bg-(--success)",
    warning: "bg-(--warning)",
  }[tone];
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-(--fg-secondary)">
      <span className={`size-1.5 shrink-0 rounded-full ${toneClass}`} />
      {label}
    </span>
  );
}

export function SplitWorkspace({
  children,
  inspector,
  inspectorWidth = 376,
}: PropsWithChildren<{ inspector: ReactNode; inspectorWidth?: number }>) {
  return (
    <div
      className="grid min-h-[620px] border-t border-(--line)"
      style={{ gridTemplateColumns: `minmax(0,1fr) ${inspectorWidth}px` }}
    >
      <div className="min-w-0 border-r border-(--line)">{children}</div>
      <aside className="min-w-0 bg-(--bg-canvas)">{inspector}</aside>
    </div>
  );
}

export function Inspector({
  children,
  status,
  subtitle,
  title,
}: PropsWithChildren<{
  status?: ReactNode;
  subtitle?: string;
  title: string;
}>) {
  return (
    <div className="px-7">
      <div className="pt-7">
        <h2 className="text-[18px] leading-6 font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 font-mono text-[10px] text-(--fg-tertiary)">
            {subtitle}
          </p>
        ) : null}
        {status ? <div className="mt-4">{status}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function InspectorSection({
  children,
  title,
}: PropsWithChildren<{ title: string }>) {
  return (
    <section className="mt-0 border-t border-(--line) py-4">
      <h3 className="mb-2 text-[12px] font-medium text-(--fg-secondary)">
        {title}
      </h3>
      <div className="space-y-1 text-[12px] leading-[1.55] text-(--fg-primary)">
        {children}
      </div>
    </section>
  );
}

export function useSelection<T>(items: readonly T[]) {
  return useState<T>(items[0]!);
}
