import * as stylex from "@stylexjs/stylex";

export const agentContextNavigationStyles = stylex.create({
  content: {
    gap: "6px",
    padding: "0 12px 16px",
  },
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
  search: {
    alignItems: "center",
    backgroundColor: "var(--color-surface-canvas)",
    borderColor: {
      default: "var(--color-border-secondary)",
      ":hover": "var(--color-border-control)",
      ":focus-within": "var(--color-border-control-focus)",
    },
    borderRadius: "var(--radius-rounded)",
    borderStyle: "solid",
    borderWidth: "0.5px",
    color: "var(--color-content-tertiary)",
    display: "flex",
    flex: "0 0 28px",
    gap: "8px",
    paddingInline: "8px",
  },
  searchInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: {
      default: "var(--color-content-primary)",
      "::placeholder": "var(--color-content-tertiary)",
    },
    font: "inherit",
    fontSize: "12px",
    lineHeight: "16px",
    minWidth: 0,
    outline: 0,
    padding: 0,
    width: "100%",
  },
});
