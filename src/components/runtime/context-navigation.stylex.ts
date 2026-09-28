import * as stylex from "@stylexjs/stylex";

export const contextNavigationStyles = stylex.create({
  content: {
    gap: "2px",
    padding: "0 12px 18px",
  },
  header: {
    display: { default: "none", "@media (max-width: 720px)": "flex" },
    paddingInline: "12px 8px",
  },
  item: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--color-sidebar-item-hover)",
    },
    borderRadius: "var(--radius-navigation)",
    boxShadow: "none",
    color: "var(--color-content-secondary)",
    fontSize: "13px",
    fontWeight: 400,
  },
  itemSelected: {
    backgroundColor: {
      default: "var(--color-sidebar-item-active)",
      ":hover": "var(--color-sidebar-item-active)",
    },
    boxShadow: "none",
    color: "var(--color-content-primary)",
  },
  section: {
    gap: "2px",
    marginBlockStart: "25px",
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
    fontSize: "11px",
    fontWeight: 400,
    lineHeight: "16px",
  },
  search: {
    alignItems: "center",
    backgroundColor: "var(--color-surface-control)",
    borderColor: {
      default: "var(--color-border-control)",
      ":focus-within": "var(--color-border-control-focus)",
      ":hover": "var(--color-border-control)",
    },
    borderRadius: "var(--radius-navigation)",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "none",
    color: "var(--color-content-tertiary)",
    display: "flex",
    flex: "0 0 32px",
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
