import { Search } from "lucide-react";
import type { PropsWithChildren } from "react";

import { cn } from "../lib/cn";

export function OperationsFilterBar({ children }: PropsWithChildren) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-(--line) bg-(--bg-panel-header) px-3">
      {children}
    </div>
  );
}

export function OperationsFilterChip({
  active = false,
  children,
  onClick,
}: PropsWithChildren<{
  active?: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      className={cn(
        "h-6 rounded-[var(--radius-control)] border px-2 text-[11px] font-medium transition-colors",
        active
          ? "native-selection border-(--accent)"
          : "border-(--line) bg-(--bg-control) text-(--fg-tertiary) shadow-(--elevation-control) hover:bg-(--bg-control-hover) hover:text-(--fg-primary)"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function OperationsSearchInput({
  ariaLabel,
  className,
  onChange,
  placeholder,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label
      className={cn(
        "ml-auto flex h-6 items-center gap-2 rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-2 text-(--fg-tertiary) shadow-(--elevation-control) focus-within:border-(--accent)",
        className ?? "w-[min(360px,45vw)]"
      )}
    >
      <Search size={12} />
      <input
        aria-label={ariaLabel}
        className="w-full bg-transparent text-[10px] text-(--fg-primary) outline-hidden placeholder:text-(--fg-tertiary)"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
