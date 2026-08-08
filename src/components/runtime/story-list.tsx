import { useConsoleLocale } from "@lenso/console-ui";
import type { ConsoleStyle } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { RefreshCcw, Search } from "lucide-react";

import type { RuntimeStory } from "../../data/mock-runtime";
import {
  formatRuntimeDuration,
  serviceColor,
  statusColor,
} from "../../lib/runtime-style";
import { buildRuntimeStory } from "../../lib/story";

const localStyles = stylex.create({
  utilityFlex: {
    display: "flex",
  },
  utilityH60px: {
    height: "60px",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityPx35: {
    paddingInline: "calc(0.25rem * 3.5)",
  },
  utilityTextSm: {
    fontSize: "var(--text-sm, 0.875rem)",
    lineHeight: "var(--text-sm--line-height, 1.25rem)",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilitySize4: {
    width: "calc(0.25rem * 4)",
    height: "calc(0.25rem * 4)",
  },
  utilityPlaceItemsCenter: {
    placeItems: "center",
  },
  utilityHoverTextFgPrimary: {
    ":hover": {
      color: "var(--fg-primary)",
    },
  },
  utilityHPx: {
    height: "1px",
  },
  utilityBgLineSubtle: {
    backgroundColor: "var(--line-subtle)",
  },
  utilityH10: {
    height: "calc(0.25rem * 10)",
  },
  utilityGap9px: {
    gap: "9px",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityBgTransparent: {
    backgroundColor: "transparent",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
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
  utilityH26px: {
    height: "26px",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityP4: {
    padding: "calc(0.25rem * 4)",
  },
  utilityText12px: {
    fontSize: "12px",
  },
  utilityLeading5: {
    lineHeight: "calc(0.25rem * 5)",
  },
  utilityH104px: {
    height: "104px",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityGap6px: {
    gap: "6px",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPt3: {
    paddingTop: "calc(0.25rem * 3)",
  },
  utilityPb25: {
    paddingBottom: "calc(0.25rem * 2.5)",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilityTransitionColors: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityBgBgRowSelected: {
    backgroundColor: "var(--bg-row-selected)",
  },
  utilityHoverBgBgRowHover: {
    ":hover": {
      backgroundColor: "var(--bg-row-hover)",
    },
  },
  utilityH18px: {
    height: "18px",
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
  },
  utilityText85px: {
    fontSize: "8.5px",
  },
  utilityMinW2: {
    minWidth: "calc(0.25rem * 2)",
  },
  utilityFlex1: {
    flex: "1",
  },
});

const styles = stylex.create({
  correlation: {
    fontFamily: "var(--font-code)",
    fontSize: 7.5,
    fontVariationSettings: '"wdth" 100',
    lineHeight: "12px",
    maxWidth: 72,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  root: {
    backgroundColor: "var(--bg-canvas)",
    display: "grid",
    gridTemplateRows: "60px 1px 40px 1px 26px 1px minmax(0,1fr)",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  pattern: (hasError: boolean) => ({
    color: hasError ? "var(--tone-error-fg)" : "var(--fg-secondary)",
    fontSize: 10,
    fontVariationSettings: '"wdth" 100',
    lineHeight: "14px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  service: (color: string) => ({
    color,
    fontFamily: "var(--font-code)",
    fontSize: 8.5,
    maxWidth: 64,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  status: (hasError: boolean) => ({
    color: hasError ? "var(--tone-error-fg)" : "var(--fg-tertiary)",
    fontFamily: "var(--font-ui)",
    fontSize: 8.5,
    fontVariationSettings: '"wdth" 100',
    fontWeight: 500,
    lineHeight: "14px",
  }),
  statusDot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "9999px",
    flexShrink: 0,
    height: 6,
    width: 6,
  }),
  storyMeta: {
    color: "var(--fg-secondary)",
    fontFamily: "var(--font-code)",
    fontSize: 10,
    lineHeight: "14px",
    whiteSpace: "pre",
  },
  storyTitle: {
    color: "var(--fg-primary)",
    flexShrink: 0,
    fontSize: 12,
    fontVariationSettings: '"wdth" 100',
    fontWeight: 500,
    height: 16,
    lineHeight: "16px",
    maxWidth: 120,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export function StoryList({
  query,
  selectedStoryId,
  setQuery,
  stylex: stylexStyle,
  stories,
  onSelect,
}: {
  stories: RuntimeStory[];
  selectedStoryId: string | null;
  query: string;
  setQuery: (query: string) => void;
  onSelect: (story: RuntimeStory) => void;
  stylex?: ConsoleStyle;
}) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  return (
    <aside
      data-runtime-slot="explorer"
      {...stylex.props(styles.root, stylexStyle)}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH60px,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityGap2,
          localStyles.utilityBgBgCanvas,
          localStyles.utilityPx35,
        ])}
      >
        <div>
          <h2
            {...stylex.props([
              localStyles.utilityTextSm,
              localStyles.utilityFontSemibold,
              localStyles.utilityTextFgPrimary,
            ])}
          >
            {zh ? "业务故事" : "Stories"}
          </h2>
          <p
            {...stylex.props([
              localStyles.utilityFontSans,
              localStyles.utilityText10px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            platform-story&nbsp; · &nbsp;{stories.length}{" "}
            {zh ? "个关联" : "correlations"}
          </p>
        </div>
        <button
          aria-label={zh ? "刷新故事" : "Refresh stories"}
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilitySize4,
            localStyles.utilityPlaceItemsCenter,
            localStyles.utilityTextFgTertiary,
            localStyles.utilityHoverTextFgPrimary,
          ])}
          onClick={() => window.location.reload()}
          type="button"
        >
          <RefreshCcw size={13} />
        </button>
      </div>
      <div
        {...stylex.props([
          localStyles.utilityHPx,
          localStyles.utilityBgLineSubtle,
        ])}
      />
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH10,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap9px,
          localStyles.utilityPx35,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        <Search size={12} />
        <input
          aria-label="Search stories"
          {...stylex.props([
            localStyles.utilityWFull,
            localStyles.utilityBgTransparent,
            localStyles.utilityFontMono,
            localStyles.utilityText10px,
            localStyles.utilityTextFgPrimary,
            localStyles.utilityOutlineHidden,
            localStyles.utilityPlaceholderTextFgQuaternary,
            localStyles.utilityFocusVisibleOutline2,
            localStyles.utilityFocusVisibleOutlineFocusRing,
            localStyles.utilityFocusVisibleOutlineOffset1,
          ])}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            zh
              ? "筛选故事 / 服务 / 关联…"
              : "filter story / service / correlation…"
          }
          value={query}
        />
      </div>
      <div
        {...stylex.props([
          localStyles.utilityHPx,
          localStyles.utilityBgLineSubtle,
        ])}
      />
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH26px,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityPx35,
          localStyles.utilityFontSans,
          localStyles.utilityText10px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        <span>{zh ? "故事" : "story"}</span>
        <span>{zh ? "状态" : "state"}</span>
      </div>
      <div
        {...stylex.props([
          localStyles.utilityHPx,
          localStyles.utilityBgLineSubtle,
        ])}
      />
      <div
        {...stylex.props([
          localStyles.utilityMinH0,
          localStyles.utilityOverflowAuto,
        ])}
      >
        {stories.length === 0 ? (
          <div
            {...stylex.props([
              localStyles.utilityP4,
              localStyles.utilityText12px,
              localStyles.utilityLeading5,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {zh
              ? "没有符合当前筛选条件的故事。"
              : "No stories match the current filter."}
          </div>
        ) : null}
        {stories.map((story) => {
          const storySummary = buildRuntimeStory(story);
          const isError =
            storySummary.status === "failed" || storySummary.status === "dead";
          const isSelected = selectedStoryId === story.id;

          return (
            <div key={story.id}>
              <button
                aria-pressed={isSelected}
                {...stylex.props(
                  [
                    localStyles.utilityFlex,
                    localStyles.utilityH104px,
                    localStyles.utilityWFull,
                    localStyles.utilityFlexCol,
                    localStyles.utilityGap6px,
                    localStyles.utilityOverflowHidden,
                    localStyles.utilityPx3,
                    localStyles.utilityPt3,
                    localStyles.utilityPb25,
                    localStyles.utilityTextLeft,
                    localStyles.utilityTransitionColors,
                  ],
                  isSelected
                    ? [localStyles.utilityBgBgRowSelected]
                    : [localStyles.utilityHoverBgBgRowHover]
                )}
                onClick={() => onSelect(story)}
                type="button"
              >
                <div
                  {...stylex.props([
                    localStyles.utilityFlex,
                    localStyles.utilityH18px,
                    localStyles.utilityWFull,
                    localStyles.utilityItemsCenter,
                    localStyles.utilityGap15,
                  ])}
                >
                  <span
                    {...stylex.props(
                      styles.statusDot(statusColor(storySummary.status))
                    )}
                  />
                  <span {...stylex.props(styles.storyTitle)}>
                    {storySummary.title}
                  </span>
                  <span {...stylex.props(styles.status(isError))}>
                    {storySummary.status}
                  </span>
                </div>

                <p {...stylex.props(styles.storyMeta)}>
                  {`${formatRuntimeDuration(storySummary.duration)}  ·  ${storySummary.nodeCount} nodes  ·  ${storySummary.errorCount} errors`}
                </p>

                <div
                  {...stylex.props(
                    styles.pattern(Boolean(isError && storySummary.rootError))
                  )}
                >
                  {isError && storySummary.rootError
                    ? storySummary.rootError
                    : storySummary.patternLabel || "No execution pattern"}
                </div>

                <div
                  {...stylex.props([
                    localStyles.utilityFlex,
                    localStyles.utilityH18px,
                    localStyles.utilityMinW0,
                    localStyles.utilityItemsCenter,
                    localStyles.utilityGap1,
                    localStyles.utilityFontMono,
                    localStyles.utilityText85px,
                  ])}
                >
                  {storySummary.services.slice(0, 3).map((service) => (
                    <span
                      {...stylex.props(styles.service(serviceColor(service)))}
                      key={service}
                    >
                      {service}
                    </span>
                  ))}
                  <span
                    {...stylex.props([
                      localStyles.utilityHPx,
                      localStyles.utilityMinW2,
                      localStyles.utilityFlex1,
                      localStyles.utilityBgLineSubtle,
                    ])}
                  />
                  <span
                    {...stylex.props(styles.correlation)}
                    title={storySummary.correlationId}
                  >
                    {shortCorrelation(storySummary.correlationId)}
                  </span>
                </div>
              </button>
              <div
                {...stylex.props([
                  localStyles.utilityHPx,
                  localStyles.utilityBgLineSubtle,
                ])}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function shortCorrelation(correlationId: string) {
  const tail = correlationId.split("-").at(-1) ?? correlationId;
  return tail.length > 12 ? `…${tail.slice(-12)}` : `…${tail}`;
}
