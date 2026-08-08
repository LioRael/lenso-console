import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  base: {
    alignItems: "center",
    backgroundColor: "var(--bg-surface-muted)",
    color: "var(--fg-tertiary)",
    display: "grid",
    fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
    fontSize: 9,
    fontWeight: 500,
    gap: 16,
    height: 28,
    letterSpacing: 0,
    minWidth: 0,
    paddingInline: 12,
    textTransform: "none",
  },
  timeline: {
    gap: 16,
    gridTemplateColumns: {
      default: "minmax(180px,260px) minmax(0,1fr)",
      "@media (max-width: 767px)": "repeat(1, minmax(0, 1fr))",
    },
  },
  waterfall: {
    gap: 12,
    gridTemplateColumns: "332px 232px",
  },
});

export const runtimeTimelineTableHeaderProps = stylex.props(
  styles.base,
  styles.timeline
);

export const runtimeWaterfallTableHeaderProps = stylex.props(
  styles.base,
  styles.waterfall
);
