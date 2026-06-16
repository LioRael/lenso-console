import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

type OperationKey =
  | "queues"
  | "dead-letters"
  | "functions"
  | "remote-calls"
  | "admin-actions";

const operationTabs: Array<{
  key: OperationKey;
  label: string;
  to: string;
}> = [
  { key: "queues", label: "Queues", to: "/operations/queues" },
  {
    key: "dead-letters",
    label: "Dead Letters",
    to: "/operations/dead-letters",
  },
  { key: "functions", label: "Functions", to: "/operations/functions" },
  {
    key: "remote-calls",
    label: "Remote Calls",
    to: "/operations/remote-calls",
  },
  {
    key: "admin-actions",
    label: "Admin Actions",
    to: "/operations/admin-actions",
  },
];

export function OperationsPage({
  active,
  children,
}: {
  active: OperationKey;
  children: ReactNode;
}) {
  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-(--background) text-(--foreground)">
      <header className="flex min-h-10 items-center gap-2 overflow-hidden border-b border-(--border-subtle) bg-(--chrome) px-2">
        <nav
          aria-label="Operations sections"
          className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden rounded-lg border border-(--border-subtle) bg-[color-mix(in_srgb,var(--surface)_58%,transparent)] p-0.5"
        >
          {operationTabs.map((tab) => (
            <Link
              className={cn(
                "h-6 shrink-0 rounded-md px-2.5 text-[11px] font-medium leading-6 transition-colors",
                active === tab.key
                  ? "native-selection"
                  : "text-(--muted) hover:bg-(--hover) hover:text-(--foreground)"
              )}
              key={tab.key}
              to={tab.to}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </section>
  );
}
