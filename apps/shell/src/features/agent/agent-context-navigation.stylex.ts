import * as stylex from "@stylexjs/stylex";

export const agentContextNavigationStyles = stylex.create({
  empty: {
    color: "var(--muted)",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "12px 8px",
  },
  stickyActions: {
    backgroundColor: "var(--surface)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "8px",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
});
