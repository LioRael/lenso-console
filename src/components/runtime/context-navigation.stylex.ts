import * as stylex from "@stylexjs/stylex";

export const contextNavigationStyles = stylex.create({
  content: {
    gap: "6px",
    padding: "0 12px 16px",
  },
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
  search: {
    alignItems: "center",
    backgroundColor: "var(--color-surface-canvas)",
    borderColor: {
      default: "var(--color-border-secondary)",
      ":focus-within": "var(--color-border-control-focus)",
      ":hover": "var(--color-border-control)",
    },
    borderRadius: "var(--radius-rounded)",
    borderStyle: "solid",
    borderWidth: "0.5px",
    boxShadow: "0 1px 0.5px rgb(0 0 0 / 4%), 0 3px 3px rgb(0 0 0 / 2%)",
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
    fontSize: "13px",
    lineHeight: "16px",
    minWidth: 0,
    outline: 0,
    padding: 0,
    width: "100%",
  },
  title: {
    color: "var(--color-content-primary)",
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: "20px",
  },
});
