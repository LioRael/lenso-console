import * as stylex from "@stylexjs/stylex";

export const contextNavigationStyles = stylex.create({
  content: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px 12px 18px",
  },
  item: {
    height: "36px",
    minHeight: "36px",
    paddingInline: "12px",
    color: "var(--muted)",
    fontSize: "13px",
    fontWeight: 400,
  },
  itemSelected: {
    color: "var(--foreground)",
  },
  section: {
    gap: "2px",
    marginBlockStart: "16px",
    width: "100%",
  },
  sectionHeader: {
    backgroundColor: "transparent",
    height: "24px",
    paddingInline: "10px 4px",
    width: "100%",
  },
  sectionLabel: {
    color: "var(--muted)",
    fontSize: "11px",
    fontWeight: 400,
    lineHeight: "16px",
  },
  search: {
    alignItems: "center",
    backgroundColor: "var(--field-background)",
    borderColor: {
      default: "var(--field-border)",
      ":focus-within": "var(--field-border-focus)",
      ":hover": "var(--field-border)",
    },
    borderRadius: "var(--radius)",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "none",
    color: "var(--muted)",
    display: "flex",
    flex: "0 0 32px",
    gap: "8px",
    paddingInline: "8px",
  },
  searchInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: {
      default: "var(--foreground)",
      "::placeholder": "var(--muted)",
    },
    font: "inherit",
    fontSize: "13px",
    lineHeight: "16px",
    minWidth: 0,
    outline: 0,
    padding: 0,
    width: "100%",
  },
});
