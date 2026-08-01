import type { ReactNode } from "react";

export const runtimeViewHeaderClassName =
  "flex h-[38px] min-w-0 items-center justify-between gap-3 overflow-hidden border-b border-(--line) bg-(--bg-panel-header) px-3";

export const runtimeViewHeaderContentClassName =
  "flex min-w-0 items-center gap-2 overflow-hidden";

export const runtimeViewHeaderLabelClassName =
  "font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-(--fg-tertiary)";

export const runtimeViewHeaderSummaryClassName =
  "min-w-0 truncate font-mono text-[11px] text-(--fg-tertiary)";

export const runtimeViewHeaderMetaClassName =
  "shrink-0 font-mono text-[11px] text-(--fg-tertiary)";

export function RuntimeViewHeader({
  children,
  title,
  summary,
  meta,
}: {
  children?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className={runtimeViewHeaderClassName}>
      <div className={runtimeViewHeaderContentClassName}>
        <span className={runtimeViewHeaderLabelClassName}>{title}</span>
        {summary ? (
          <span className={runtimeViewHeaderSummaryClassName}>{summary}</span>
        ) : null}
      </div>
      {meta ? (
        <div className={runtimeViewHeaderMetaClassName}>{meta}</div>
      ) : null}
      {children ? (
        <div className={runtimeViewHeaderMetaClassName}>{children}</div>
      ) : null}
    </div>
  );
}
