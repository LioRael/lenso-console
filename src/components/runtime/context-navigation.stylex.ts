import * as stylex from "@stylexjs/stylex";

export const contextNavigationStyles = stylex.create({
  header: {
    paddingInline: "12px 8px",
  },
  item: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--color-sidebar-item-hover)",
    },
    borderRadius: "var(--radius-rounded)",
    boxShadow: "none",
    fontSize: "12px",
    fontWeight: 400,
  },
  itemSelected: {
    backgroundColor: {
      default: "var(--color-surface-selected)",
      ":hover": "var(--color-surface-selected)",
    },
    boxShadow: "inset 0 0 0 0.5px var(--color-border-translucent)",
  },
  section: {
    gap: "3px",
    marginBlockStart: "18px",
    width: "100%",
  },
  sectionHeader: {
    backgroundColor: "transparent",
    height: "24px",
    paddingInline: "10px 4px",
    width: "100%",
  },
  sectionLabel: {
    color: "var(--color-content-tertiary)",
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    lineHeight: "14px",
    textTransform: "uppercase",
  },
  title: {
    color: "var(--color-content-primary)",
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: "20px",
  },
});
