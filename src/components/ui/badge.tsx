import type { PropsWithChildren } from "react";

import { cn } from "../../lib/cn";

export function Badge({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-(--border-subtle) bg-(--elevated) px-2.5 py-1 text-xs font-medium text-(--secondary)",
        className
      )}
    >
      {children}
    </span>
  );
}
