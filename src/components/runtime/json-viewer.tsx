import type { ConsoleStyle } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import { prettyJson } from "../../lib/format";

const localStyles = stylex.create({
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityH52px: {
    height: "52px",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderLineSubtle: {
    borderColor: "var(--line-subtle)",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPt25: {
    paddingTop: "calc(0.25rem * 2.5)",
  },
  utilityPb9px: {
    paddingBottom: "9px",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilityHoverBgBgControlHover: {
    ":hover": {
      backgroundColor: "var(--bg-control-hover)",
    },
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilitySize3: {
    width: "calc(0.25rem * 3)",
    height: "calc(0.25rem * 3)",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityMaxH320px: {
    maxHeight: "320px",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityBorderT: {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
  },
  utilityPy25: {
    paddingBlock: "calc(0.25rem * 2.5)",
  },
  utilityLeading15px: {
    lineHeight: "15px",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityWhitespacePreWrap: {
    whiteSpace: "pre-wrap",
  },
});

type JsonViewerProps = {
  bordered?: boolean;
  countLabel?: string;
  stylex?: ConsoleStyle;
  title: string;
  value: unknown;
  defaultExpanded?: boolean;
  notice?: ReactNode;
  variant?: "default" | "payload-row";
};

export function JsonViewer({
  bordered = true,
  countLabel,
  stylex: stylexStyle,
  title,
  value,
  defaultExpanded = false,
  notice,
  variant = "default",
}: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const json = prettyJson(value);
  const count = jsonFieldCount(value);
  const payloadRow = variant === "payload-row";

  return (
    <section
      {...stylex.props(
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBgCanvas,
        payloadRow && [localStyles.utilityShrink0],
        bordered && [
          localStyles.utilityBorderB,
          localStyles.utilityBorderLineSubtle,
        ],
        stylexStyle
      )}
    >
      <button
        {...stylex.props(
          [
            localStyles.utilityFlex,
            localStyles.utilityH52px,
            localStyles.utilityWFull,
            localStyles.utilityItemsCenter,
            localStyles.utilityPx3,
            localStyles.utilityPt25,
            localStyles.utilityPb9px,
            localStyles.utilityTextLeft,
            localStyles.utilityHoverBgBgControlHover,
          ],
          payloadRow
            ? [localStyles.utilityJustifyBetween]
            : [localStyles.utilityGap2]
        )}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {payloadRow ? (
          <span
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityItemsCenter,
              localStyles.utilityGap2,
            ])}
          >
            {expanded ? (
              <ChevronDown
                {...stylex.props([
                  localStyles.utilitySize3,
                  localStyles.utilityShrink0,
                  localStyles.utilityTextFgTertiary,
                ])}
              />
            ) : (
              <ChevronRight
                {...stylex.props([
                  localStyles.utilitySize3,
                  localStyles.utilityShrink0,
                  localStyles.utilityTextFgTertiary,
                ])}
              />
            )}
            <span
              {...stylex.props([
                localStyles.utilityFontSans,
                localStyles.utilityText11px,
                localStyles.utilityFontMedium,
                localStyles.utilityTextFgPrimary,
              ])}
            >
              {title}
            </span>
          </span>
        ) : (
          <>
            {expanded ? (
              <ChevronDown
                {...stylex.props([
                  localStyles.utilitySize3,
                  localStyles.utilityTextFgTertiary,
                ])}
              />
            ) : (
              <ChevronRight
                {...stylex.props([
                  localStyles.utilitySize3,
                  localStyles.utilityTextFgTertiary,
                ])}
              />
            )}
            <span
              {...stylex.props([
                localStyles.utilityFontSans,
                localStyles.utilityText11px,
                localStyles.utilityFontMedium,
                localStyles.utilityTextFgPrimary,
              ])}
            >
              {title}
            </span>
          </>
        )}
        <span
          {...stylex.props(
            [
              localStyles.utilityFontMono,
              localStyles.utilityText10px,
              localStyles.utilityTextFgTertiary,
            ],
            !payloadRow && [localStyles.utilityMlAuto]
          )}
        >
          {countLabel ?? `${count} fields`}
        </span>
      </button>
      {notice}
      {expanded ? (
        <div
          {...stylex.props([
            localStyles.utilityMaxH320px,
            localStyles.utilityOverflowAuto,
            localStyles.utilityBorderT,
            localStyles.utilityBorderLineSubtle,
            localStyles.utilityPx3,
            localStyles.utilityPy25,
            localStyles.utilityFontMono,
            localStyles.utilityText11px,
            localStyles.utilityLeading15px,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          <pre {...stylex.props([localStyles.utilityWhitespacePreWrap])}>
            {json}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function jsonFieldCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return 1;
}
