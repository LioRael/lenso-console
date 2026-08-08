import { useConsoleLocale } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { Flame, GitBranch, Grid3X3, List, Workflow } from "lucide-react";

import { HorizontalTabScroll } from "./horizontal-tab-scroll";

const localStyles = stylex.create({
  utilityHFull: {
    height: "100%",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityWMax: {
    width: "max-content",
  },
  utilityMinWFull: {
    minWidth: "100%",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap0: {
    gap: "calc(0.25rem * 0)",
  },
  utilityBorderB0: {
    borderBottomWidth: "0px",
  },
  utilityPl2: {
    paddingLeft: "calc(0.25rem * 2)",
  },
  utilityPr0: {
    paddingRight: "calc(0.25rem * 0)",
  },
  utilityH33px: {
    height: "33px",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityPx1: {
    paddingInline: "calc(0.25rem * 1)",
  },
  utilityPt2: {
    paddingBlockStart: "0.5rem",
  },
  utilityPb0: {
    paddingBlockEnd: 0,
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
  utilityText12px: {
    fontSize: "12px",
  },
  utilityFontNormal: {
    fontWeight: "400",
  },
  utilityLeading4: {
    lineHeight: "calc(0.25rem * 4)",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityH4: {
    height: "calc(0.25rem * 4)",
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityHPx: {
    height: "1px",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityBgAccent: {
    backgroundColor: "var(--accent)",
  },
  utilityOpacity100: {
    opacity: "100%",
  },
  utilityOpacity0: {
    opacity: "0%",
  },
});

export type StoryViewMode =
  | "story"
  | "graph"
  | "timeline"
  | "waterfall"
  | "flame"
  | "heatmap";

const labels: Array<{
  id: StoryViewMode;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
  }>;
}> = [
  { id: "story", label: "Story", icon: Workflow },
  { id: "graph", label: "Graph", icon: GitBranch },
  { id: "timeline", label: "Timeline", icon: Workflow },
  { id: "waterfall", label: "Waterfall", icon: List },
  { id: "flame", label: "Flame", icon: Flame },
  { id: "heatmap", label: "Heatmap", icon: Grid3X3 },
];

export function StoryTabs({
  mode,
  onChange,
}: {
  mode: StoryViewMode;
  onChange: (mode: StoryViewMode) => void;
}) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  return (
    <div
      {...stylex.props([
        localStyles.utilityHFull,
        localStyles.utilityMinW0,
        localStyles.utilityBgBgCanvas,
      ])}
    >
      <HorizontalTabScroll>
        <div
          aria-label={zh ? "故事视图" : "Story views"}
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityHFull,
            localStyles.utilityWMax,
            localStyles.utilityMinWFull,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap0,
            localStyles.utilityBorderB0,
            localStyles.utilityPl2,
            localStyles.utilityPr0,
          ])}
          role="tablist"
        >
          {labels.map(({ icon: Icon, id, label }, index) => (
            <button
              aria-controls="story-view-panel"
              aria-selected={mode === id}
              {...stylex.props(
                [
                  localStyles.utilityFlex,
                  localStyles.utilityH33px,
                  localStyles.utilityShrink0,
                  localStyles.utilityFlexCol,
                  localStyles.utilityItemsCenter,
                  localStyles.utilityGap2,
                  localStyles.utilityPx1,
                  localStyles.utilityPt2,
                  localStyles.utilityPb0,
                  localStyles.utilityFontSans,
                  localStyles.utilityText12px,
                  localStyles.utilityFontNormal,
                  localStyles.utilityLeading4,
                  localStyles.utilityTextFgTertiary,
                ],
                mode === id && [
                  localStyles.utilityFontMedium,
                  localStyles.utilityTextFgPrimary,
                ]
              )}
              id={`story-tab-${id}`}
              key={id}
              onClick={() => onChange(id)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key
                  )
                ) {
                  return;
                }
                event.preventDefault();
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? labels.length - 1
                      : event.key === "ArrowRight"
                        ? (index + 1) % labels.length
                        : (index - 1 + labels.length) % labels.length;
                const next = labels[nextIndex];
                if (next) {
                  onChange(next.id);
                  document.getElementById(`story-tab-${next.id}`)?.focus();
                }
              }}
              role="tab"
              tabIndex={mode === id ? 0 : -1}
              type="button"
            >
              <span
                {...stylex.props([
                  localStyles.utilityFlex,
                  localStyles.utilityH4,
                  localStyles.utilityItemsCenter,
                  localStyles.utilityGap1,
                  localStyles.utilityOverflowHidden,
                ])}
              >
                <Icon size={12} strokeWidth={1.75} />
                {zh ? storyTabZh[id] : label}
              </span>
              <span
                {...stylex.props(
                  [
                    localStyles.utilityHPx,
                    localStyles.utilityWFull,
                    localStyles.utilityBgAccent,
                  ],
                  mode === id
                    ? [localStyles.utilityOpacity100]
                    : [localStyles.utilityOpacity0]
                )}
              />
            </button>
          ))}
        </div>
      </HorizontalTabScroll>
    </div>
  );
}

const storyTabZh: Record<StoryViewMode, string> = {
  story: "故事",
  graph: "图谱",
  timeline: "时间线",
  waterfall: "瀑布图",
  flame: "火焰图",
  heatmap: "热力图",
};
