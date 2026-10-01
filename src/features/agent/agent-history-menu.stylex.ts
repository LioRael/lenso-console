import * as stylex from "@stylexjs/stylex";

export const agentHistoryMenuStyles = stylex.create({
  empty: {
    alignItems: "center",
    color: {
      default: "lch(58 1 282)",
      "@media (prefers-color-scheme: dark)": "var(--muted)",
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
      "@media (prefers-color-scheme: dark)": "var(--foreground)",
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
      "@media (prefers-color-scheme: dark)": "var(--surface)",
    },
    borderColor: {
      default: "lch(91.9 0 282)",
      "@media (prefers-color-scheme: dark)": "var(--border)",
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
      "@media (prefers-color-scheme: dark)": "var(--muted)",
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
      "@media (prefers-color-scheme: dark)": "var(--surface)",
    },
    borderBottomColor: {
      default: "lch(91.9 0 282)",
      "@media (prefers-color-scheme: dark)": "var(--border)",
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
        "@media (prefers-color-scheme: dark)": "var(--muted)",
      },
      opacity: 1,
    },
    backgroundColor: "transparent",
    borderWidth: 0,
    caretColor: "var(--accent)",
    color: {
      default: "lch(20 1 282)",
      "@media (prefers-color-scheme: dark)": "var(--foreground)",
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
      "@media (prefers-color-scheme: dark)": "var(--muted)",
    },
    display: "flex",
    fontSize: "12px",
    fontWeight: 500,
    height: "30px",
    padding: "8px 14px",
    width: "320px",
  },
});
