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
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-(--bg-canvas) text-(--fg-primary)">
      <header className="flex min-h-10 items-center gap-2 overflow-hidden border-b border-(--line) bg-(--bg-panel-header) px-2">
        <nav
          aria-label="Operations sections"
          className="lenso-ui-tabs__list h-10 min-w-0 overflow-x-auto border-b-0"
        >
          {operationTabs.map((tab) => (
            <Link
              className={cn(
                "lenso-ui-tabs__tab h-full min-h-0 shrink-0 text-[11px]",
                active === tab.key && "text-(--fg-primary)"
              )}
              aria-selected={active === tab.key}
              key={tab.key}
              role="tab"
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
