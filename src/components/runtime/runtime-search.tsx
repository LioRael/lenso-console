import * as stylex from "@stylexjs/stylex";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useConsole } from "./console-context";

const localStyles = stylex.create({
  utilityRelative: {
    position: "relative",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityH7: {
    height: "calc(0.25rem * 7)",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityRoundedVarRadiusControl: {
    borderRadius: "var(--radius-control)",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgControl: {
    backgroundColor: "var(--bg-control)",
  },
  utilityPx2: {
    paddingInline: "calc(0.25rem * 2)",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityShadowElevationControl: {
    boxShadow: "var(--elevation-control)",
  },
  utilityTransitionColors: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityFocusWithinBorderAccent: {
    ":focus-within": {
      borderColor: "var(--accent)",
    },
  },
  utilityFocusWithinBgBgControlHover: {
    ":focus-within": {
      backgroundColor: "var(--bg-control-hover)",
    },
  },
  utilityWFull: {
    width: "100%",
  },
  utilityBgTransparent: {
    backgroundColor: "transparent",
  },
  utilityTextXs: {
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "var(--text-xs--line-height, 1rem)",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityOutlineHidden: {
    outlineStyle: "none",
    outline: "2px solid transparent",
    outlineOffset: "2px",
  },
  utilityPlaceholderTextFgQuaternary: {
    "::placeholder": {
      color: "var(--fg-quaternary)",
    },
  },
  utilityFocusVisibleOutline2: {
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "2px",
    },
  },
  utilityFocusVisibleOutlineFocusRing: {
    ":focus-visible": {
      outlineColor: "var(--focus-ring)",
    },
  },
  utilityFocusVisibleOutlineOffset1: {
    ":focus-visible": {
      outlineOffset: "1px",
    },
  },
  utilityRounded: {
    borderRadius: "0.25rem",
  },
  utilityPx1: {
    paddingInline: "calc(0.25rem * 1)",
  },
  utilityPy05: {
    paddingBlock: "calc(0.25rem * 0.5)",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityLeadingNone: {
    lineHeight: "1",
  },
  utilityAbsolute: {
    position: "absolute",
  },
  utilityLeft0: {
    left: "calc(0.25rem * 0)",
  },
  utilityTop9: {
    top: "calc(0.25rem * 9)",
  },
  utilityZ30: {
    zIndex: "30",
  },
  utilityWMin620pxCalc100vw64px: {
    width: "min(620px, calc(100vw - 64px))",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityRoundedVarRadiusPopover: {
    borderRadius: "var(--radius-popover)",
  },
  utilityBgBgOverlay: {
    backgroundColor: "var(--bg-overlay)",
  },
  utilityShadowElevationOverlay: {
    boxShadow: "var(--elevation-overlay)",
  },
  utilityP3: {
    padding: "calc(0.25rem * 3)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityGridCols86pxMinmax01fr: {
    gridTemplateColumns: "86px minmax(0,1fr)",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityPx25: {
    paddingInline: "calc(0.25rem * 2.5)",
  },
  utilityPy2: {
    paddingBlock: "calc(0.25rem * 2)",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilityLastBorderB0: {
    ":last-child": {
      borderBottomWidth: "0px",
    },
  },
  utilityHoverBgBgRowHover: {
    ":hover": {
      backgroundColor: "var(--bg-row-hover)",
    },
  },
  utilitySelfCenter: {
    alignSelf: "center",
  },
  utilityFontBold: {
    fontWeight: "700",
  },
  utilityUppercase: {
    textTransform: "uppercase",
  },
  utilityTracking004em: {
    letterSpacing: "0.04em",
  },
  utilityBlock: {
    display: "block",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityMt05: {
    marginTop: "calc(0.25rem * 0.5)",
  },
});

export function RuntimeSearch() {
  const { searchInputRef, searchRuntime, selectSearchResult } = useConsole();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => searchRuntime(query), [query, searchRuntime]);

  return (
    <div {...stylex.props([localStyles.utilityRelative])}>
      <label
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH7,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap2,
          localStyles.utilityRoundedVarRadiusControl,
          localStyles.utilityBorder,
          localStyles.utilityBorderLine,
          localStyles.utilityBgBgControl,
          localStyles.utilityPx2,
          localStyles.utilityTextFgTertiary,
          localStyles.utilityShadowElevationControl,
          localStyles.utilityTransitionColors,
          localStyles.utilityFocusWithinBorderAccent,
          localStyles.utilityFocusWithinBgBgControlHover,
        ])}
      >
        <Search size={13} />
        <input
          ref={searchInputRef}
          aria-label="Search runtime"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          {...stylex.props([
            localStyles.utilityWFull,
            localStyles.utilityBgTransparent,
            localStyles.utilityTextXs,
            localStyles.utilityTextFgPrimary,
            localStyles.utilityOutlineHidden,
            localStyles.utilityPlaceholderTextFgQuaternary,
            localStyles.utilityFocusVisibleOutline2,
            localStyles.utilityFocusVisibleOutlineFocusRing,
            localStyles.utilityFocusVisibleOutlineOffset1,
          ])}
          placeholder="story / node / correlation / outbox / function"
          value={query}
        />
        <span
          {...stylex.props([
            localStyles.utilityRounded,
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityPx1,
            localStyles.utilityPy05,
            localStyles.utilityText11px,
            localStyles.utilityLeadingNone,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          /
        </span>
      </label>
      {open && query.trim() ? (
        <div
          {...stylex.props([
            localStyles.utilityAbsolute,
            localStyles.utilityLeft0,
            localStyles.utilityTop9,
            localStyles.utilityZ30,
            localStyles.utilityWMin620pxCalc100vw64px,
            localStyles.utilityOverflowHidden,
            localStyles.utilityRoundedVarRadiusPopover,
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityBgBgOverlay,
            localStyles.utilityShadowElevationOverlay,
          ])}
        >
          {results.length === 0 ? (
            <div
              {...stylex.props([
                localStyles.utilityP3,
                localStyles.utilityTextXs,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              No runtime objects found
            </div>
          ) : (
            results.map((result) => (
              <button
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilityWFull,
                  localStyles.utilityGridCols86pxMinmax01fr,
                  localStyles.utilityGap3,
                  localStyles.utilityBorderB,
                  localStyles.utilityBorderLine,
                  localStyles.utilityBgTransparent,
                  localStyles.utilityPx25,
                  localStyles.utilityPy2,
                  localStyles.utilityTextLeft,
                  localStyles.utilityTextFgPrimary,
                  localStyles.utilityLastBorderB0,
                  localStyles.utilityHoverBgBgRowHover,
                ])}
                key={`${result.kind}:${result.id}`}
                onClick={() => {
                  selectSearchResult(result);
                  setOpen(false);
                  setQuery("");
                }}
                type="button"
              >
                <span
                  {...stylex.props([
                    localStyles.utilitySelfCenter,
                    localStyles.utilityText11px,
                    localStyles.utilityFontBold,
                    localStyles.utilityUppercase,
                    localStyles.utilityTracking004em,
                    localStyles.utilityTextFgTertiary,
                  ])}
                >
                  {searchResultKindLabel(result.kind)}
                </span>
                <span>
                  <strong
                    {...stylex.props([
                      localStyles.utilityBlock,
                      localStyles.utilityTruncate,
                      localStyles.utilityTextXs,
                      localStyles.utilityFontSemibold,
                    ])}
                  >
                    {result.title}
                  </strong>
                  <small
                    {...stylex.props([
                      localStyles.utilityMt05,
                      localStyles.utilityBlock,
                      localStyles.utilityTruncate,
                      localStyles.utilityText11px,
                      localStyles.utilityTextFgTertiary,
                    ])}
                  >
                    {result.subtitle}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function searchResultKindLabel(kind: string) {
  if (kind === "event") {
    return "outbox";
  }
  return kind;
}
