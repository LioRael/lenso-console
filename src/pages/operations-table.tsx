import type { PropsWithChildren } from "react";

import { cn } from "../lib/cn";

export function OperationsTableHeader({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "grid h-7 items-center border-b border-(--line) bg-(--bg-panel-header) px-3 text-[10px] font-semibold uppercase text-(--fg-tertiary)",
        className
      )}
    >
      {children}
    </div>
  );
}

export function OperationsSelectableRow({
  children,
  className,
  isSelected,
  onClick,
}: PropsWithChildren<{
  className?: string;
  isSelected: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      className={cn(
        "grid w-full items-center border-b border-(--line) px-3 text-left text-[12px] transition-colors",
        isSelected ? "native-selection" : "hover:bg-(--bg-row-hover)",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function OperationsAggregateRow({
  children,
  className,
  onClick,
}: PropsWithChildren<{
  className?: string;
  onClick: () => void;
}>) {
  return (
    <button
      className={cn(
        "grid h-8 w-full items-center border-b border-(--line) px-3 text-left text-[11px] hover:bg-(--bg-row-hover)",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function OperationsKeyValueRows({
  rowClassName,
  rows,
  valueClassName,
}: {
  rows: Array<[string, string]>;
  rowClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className="w-max min-w-full border-b border-(--line) text-xs">
      {rows.map(([key, value]) => (
        <div
          className={cn(
            "grid w-max min-w-full border-b border-(--line) last:border-b-0",
            rowClassName ?? "grid-cols-[124px_minmax(220px,max-content)]"
          )}
          key={key}
        >
          <div className="bg-(--bg-panel-header) px-3 py-1.5 text-(--fg-tertiary)">
            {key}
          </div>
          <div
            className={cn(
              "px-3 py-1.5 text-(--fg-secondary)",
              valueClassName ?? "whitespace-pre-wrap"
            )}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
