import type { PropsWithChildren } from "react";

import { cn } from "../../lib/cn";

export function Badge({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-2.5 py-1 text-xs font-medium text-(--fg-secondary) shadow-(--elevation-control)",
        className
      )}
    >
      {children}
    </span>
  );
}
