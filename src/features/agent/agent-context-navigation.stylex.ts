import * as stylex from "@stylexjs/stylex";

export const agentContextNavigationStyles = stylex.create({
  empty: {
    color: "var(--color-content-tertiary)",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "12px 8px",
  },
  meta: {
    color: "var(--color-content-tertiary)",
    fontSize: "10px",
    fontVariantNumeric: "tabular-nums",
  },
  mobileClose: {
    display: {
      default: "none",
      "@media (max-width: 760px)": "flex",
    },
  },
  stickyActions: {
    backgroundColor: "var(--color-surface-sidebar)",
    borderEndEndRadius: "14px",
    borderEndStartRadius: "14px",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "6px",
    position: "sticky",
    top: 0,
    zIndex: 1,
    "::before": {
      backdropFilter: "blur(1px)",
      borderStartEndRadius: "14px",
      borderStartStartRadius: "14px",
      content: "''",
      height: "12px",
      insetInline: 0,
      maskImage:
        "linear-gradient(to bottom, rgb(0 0 0 / 70%), rgb(0 0 0 / 18%) 58%, transparent)",
      pointerEvents: "none",
      position: "absolute",
      top: "calc(100% - 0.5px)",
    },
    "::after": {
      backdropFilter: "blur(3px)",
      borderStartEndRadius: "14px",
      borderStartStartRadius: "14px",
      content: "''",
      height: "6px",
      insetInline: 0,
      maskImage:
        "linear-gradient(to bottom, rgb(0 0 0 / 82%), rgb(0 0 0 / 26%) 62%, transparent)",
      pointerEvents: "none",
      position: "absolute",
      top: "calc(100% - 0.5px)",
    },
  },
});
