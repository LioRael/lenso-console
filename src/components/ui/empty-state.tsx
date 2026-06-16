import type { PropsWithChildren, ReactNode } from "react";

import { cn } from "../../lib/cn";

function EmptyStateRoot({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "grid place-items-center gap-2 p-12 text-center text-(--fg-tertiary)",
        className
      )}
    >
      {children}
    </div>
  );
}

function EmptyStateIcon({ children }: { children: ReactNode }) {
  return <div className="text-(--fg-tertiary)">{children}</div>;
}

function EmptyStateTitle({ children }: PropsWithChildren) {
  return (
    <h2 className="text-base font-semibold text-(--fg-primary)">{children}</h2>
  );
}

function EmptyStateDescription({ children }: PropsWithChildren) {
  return (
    <p className="max-w-md text-sm leading-6 text-(--fg-tertiary)">
      {children}
    </p>
  );
}

export const EmptyState = Object.assign(EmptyStateRoot, {
  Icon: EmptyStateIcon,
  Title: EmptyStateTitle,
  Description: EmptyStateDescription,
});
