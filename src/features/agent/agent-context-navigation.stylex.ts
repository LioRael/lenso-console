import * as stylex from "@stylexjs/stylex";

export const agentContextNavigationStyles = stylex.create({
  empty: {
    color: "var(--color-content-tertiary)",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "12px 8px",
  },
  mobileClose: {
    display: {
      default: "none",
      "@media (max-width: 720px)": "flex",
    },
    position: "absolute",
    insetBlockStart: "8px",
    insetInlineEnd: "8px",
    zIndex: 2,
  },
  stickyActions: {
    backgroundColor: "var(--color-surface-sidebar)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "8px",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
});
