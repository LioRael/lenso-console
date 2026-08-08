import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

const localStyles = stylex.create({
  utilityFlex: {
    display: "flex",
  },
  utilityH38px: {
    height: "38px",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityBgBgSurface: {
    backgroundColor: "var(--bg-surface)",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
  utilityText12px: {
    fontSize: "12px",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
});

export const runtimeViewHeaderProps = stylex.props([
  localStyles.utilityFlex,
  localStyles.utilityH38px,
  localStyles.utilityMinW0,
  localStyles.utilityItemsCenter,
  localStyles.utilityJustifyBetween,
  localStyles.utilityGap3,
  localStyles.utilityOverflowHidden,
  localStyles.utilityBgBgSurface,
  localStyles.utilityPx3,
]);

export const runtimeViewHeaderContentProps = stylex.props([
  localStyles.utilityFlex,
  localStyles.utilityMinW0,
  localStyles.utilityItemsCenter,
  localStyles.utilityGap2,
  localStyles.utilityOverflowHidden,
]);

export const runtimeViewHeaderLabelProps = stylex.props([
  localStyles.utilityFontSans,
  localStyles.utilityText12px,
  localStyles.utilityFontMedium,
  localStyles.utilityTextFgPrimary,
]);

export const runtimeViewHeaderSummaryProps = stylex.props([
  localStyles.utilityMinW0,
  localStyles.utilityTruncate,
  localStyles.utilityFontMono,
  localStyles.utilityText10px,
  localStyles.utilityTextFgTertiary,
]);

export const runtimeViewHeaderMetaProps = stylex.props([
  localStyles.utilityShrink0,
  localStyles.utilityFontMono,
  localStyles.utilityText10px,
  localStyles.utilityTextFgSecondary,
]);

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
    <div {...runtimeViewHeaderProps}>
      <div {...runtimeViewHeaderContentProps}>
        <span {...runtimeViewHeaderLabelProps}>{title}</span>
        {summary ? (
          <span {...runtimeViewHeaderSummaryProps}>{summary}</span>
        ) : null}
      </div>
      {meta ? <div {...runtimeViewHeaderMetaProps}>{meta}</div> : null}
      {children ? <div {...runtimeViewHeaderMetaProps}>{children}</div> : null}
    </div>
  );
}
