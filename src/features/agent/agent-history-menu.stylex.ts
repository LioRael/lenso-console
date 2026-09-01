import * as stylex from "@stylexjs/stylex";

export const agentHistoryMenuStyles = stylex.create({
  empty: {
    alignItems: "center",
    color: {
      default: "lch(58 1 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-content-tertiary)",
    },
    display: "flex",
    fontSize: "12px",
    height: "44px",
    padding: "0 14px",
  },
  item: {
    backgroundColor: {
      default: "transparent",
      ":hover": "lch(94.854 0.5 282)",
      "[data-highlighted]": "lch(94.854 0.5 282)",
      "@media (prefers-color-scheme: dark)": "transparent",
      "@media (prefers-color-scheme: dark) and (hover: hover)": "transparent",
    },
    borderRadius: "7px",
    color: {
      default: "lch(20 1 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-content-primary)",
    },
    fontSize: "13px",
    height: "32px",
    lineHeight: "19.5px",
    marginInline: "6px",
    padding: "0 12px 0 8px",
    width: "308px",
  },
  menu: {
    backgroundColor: {
      default: "lch(100 0 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-surface-panel)",
    },
    borderColor: {
      default: "lch(91.9 0 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-border-secondary)",
    },
    borderRadius: "12px",
    borderStyle: "solid",
    borderWidth: "0.5px",
    boxShadow:
      "0 6px 18px lch(0 0 0 / 2%), 0 3px 9px lch(0 0 0 / 4%), 0 1px 1px lch(0 0 0 / 4%)",
    overflow: "hidden",
    padding: "0 0 5.5px",
    width: "321px",
  },
  meta: {
    alignItems: "center",
    color: {
      default: "lch(66 1 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-content-tertiary)",
    },
    display: "flex",
    gap: "8px",
    whiteSpace: "nowrap",
  },
  metaCurrent: { color: "lch(58 1 282)" },
  newChat: { marginBlockStart: "6px" },
  search: {
    alignItems: "center",
    backgroundColor: {
      default: "lch(100 0 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-surface-panel)",
    },
    borderBottomColor: {
      default: "lch(91.9 0 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-border-secondary)",
    },
    borderBottomStyle: "solid",
    borderBottomWidth: "0.5px",
    display: "flex",
    height: "36.5px",
    padding: "0 14px",
    width: "320px",
  },
  searchInput: {
    "::-webkit-search-cancel-button": { display: "none" },
    "::placeholder": {
      color: {
        default: "lch(40 1 282)",
        "@media (prefers-color-scheme: dark)": "var(--color-content-tertiary)",
      },
      opacity: 1,
    },
    backgroundColor: "transparent",
    borderWidth: 0,
    caretColor: "var(--color-action-primary)",
    color: {
      default: "lch(20 1 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-content-primary)",
    },
    font: "inherit",
    fontSize: "13px",
    height: "36px",
    lineHeight: "19.5px",
    outline: 0,
    padding: 0,
    width: "100%",
  },
  section: {
    alignItems: "center",
    color: {
      default: "lch(40 1 282)",
      "@media (prefers-color-scheme: dark)": "var(--color-content-tertiary)",
    },
    display: "flex",
    fontSize: "12px",
    fontWeight: 500,
    height: "30px",
    padding: "8px 14px",
    width: "320px",
  },
});
