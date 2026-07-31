import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export function OperationsInspectorHeader({
  eyebrow,
  meta,
  title,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-(--line) bg-(--bg-panel) px-3 py-2">
      <div className="mb-1 text-[10px] font-medium text-(--fg-tertiary)">
        {eyebrow}
      </div>
      <div className="truncate text-[13px] font-semibold text-(--fg-primary)">
        {title}
      </div>
      {meta ? (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-(--fg-tertiary)">
          {meta}
        </div>
      ) : null}
    </header>
  );
}

export function OperationsStatusBanner({
  label,
  summary,
  tone,
}: {
  label: string;
  summary: string;
  tone: "success" | "warning" | "error";
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-b px-3 py-2",
        tone === "success" &&
          "border-[var(--tone-success-border)] bg-[var(--tone-success-bg)]",
        tone === "warning" &&
          "border-[var(--tone-warning-border)] bg-[var(--tone-warning-bg)]",
        tone === "error" &&
          "border-[var(--tone-error-border)] bg-[var(--tone-error-bg)]"
      )}
    >
      {tone === "success" ? (
        <CheckCircle2 className="mt-0.5 text-(--tone-success-fg)" size={14} />
      ) : (
        <AlertTriangle
          className={cn(
            "mt-0.5",
            tone === "warning"
              ? "text-(--tone-warning-fg)"
              : "text-(--tone-error-fg)"
          )}
          size={14}
        />
      )}
      <div className="min-w-0">
        <div
          className={cn(
            "text-[11px] font-semibold",
            tone === "success" && "text-(--tone-success-fg)",
            tone === "warning" && "text-(--tone-warning-fg)",
            tone === "error" && "text-(--tone-error-fg)"
          )}
        >
          {label}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-(--fg-secondary)">
          {summary}
        </div>
      </div>
    </div>
  );
}

export function OperationsSectionTitle({ children }: { children: string }) {
  return (
    <div className="border-b border-(--line) bg-(--bg-panel-header) px-3 py-1.5 text-[11px] font-medium text-(--fg-secondary)">
      {children}
    </div>
  );
}
