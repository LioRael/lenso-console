import { stylexClassName } from "@lenso/console-ui";
import type { ReactNode } from "react";

export const runtimeViewHeaderClassName = stylexClassName(
  "flex h-[38px] min-w-0 items-center justify-between gap-3 overflow-hidden bg-(--bg-surface) px-3"
);

export const runtimeViewHeaderContentClassName = stylexClassName(
  "flex min-w-0 items-center gap-2 overflow-hidden"
);

export const runtimeViewHeaderLabelClassName = stylexClassName(
  "font-sans text-[12px] font-medium text-(--fg-primary)"
);

export const runtimeViewHeaderSummaryClassName = stylexClassName(
  "min-w-0 truncate font-mono text-[10px] text-(--fg-tertiary)"
);

export const runtimeViewHeaderMetaClassName = stylexClassName(
  "shrink-0 font-mono text-[10px] text-(--fg-secondary)"
);

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
