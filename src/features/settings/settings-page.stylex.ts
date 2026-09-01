import * as stylex from "@stylexjs/stylex";

export const settingsPageStyles = stylex.create({
  column: {
    margin: "0 auto",
    padding: {
      default: "64px 0 80px",
      "@media (max-width: 760px)": "56px 0 80px",
    },
    width: {
      default: "min(640px, calc(100% - 48px))",
      "@media (max-width: 760px)": "calc(100% - 32px)",
      "@media (max-width: 520px)": "calc(100% - 24px)",
    },
  },
  group: {
    backgroundColor: "var(--color-surface-panel)",
    borderColor: "var(--color-border-tertiary)",
    borderRadius: "10px",
    borderStyle: "solid",
    borderWidth: "0.5px",
    boxShadow: "none",
  },
  page: {
    color: "var(--color-content-primary)",
    minHeight: "100%",
    overflowY: "auto",
    width: "100%",
  },
  pageTitle: {
    fontSize: "24px",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: "32px",
    margin: "0 16px",
  },
  row: {
    alignItems: {
      default: null,
      "@media (max-width: 520px)": "flex-start",
    },
    backgroundColor: {
      default: "transparent",
      ":hover": "transparent",
    },
    borderBottomColor: "var(--color-border-tertiary)",
    borderBottomStyle: "solid",
    borderBottomWidth: "0.5px",
    borderInlineWidth: 0,
    borderTopWidth: 0,
    gap: { default: null, "@media (max-width: 520px)": "10px" },
    gridTemplateColumns: {
      default: null,
      "@media (max-width: 760px)": "minmax(0, 1fr) auto",
      "@media (max-width: 520px)": "minmax(0, 1fr)",
    },
    minHeight: "65px",
    opacity: 1,
    padding: "10px 16px",
    paddingBlock: { default: "10px", "@media (max-width: 520px)": "12px" },
  },
  rowDisabled: {
    opacity: 0.4,
  },
  rowDescription: {
    color: "var(--color-content-tertiary)",
    fontSize: "12px",
    lineHeight: "18px",
  },
  rowTitle: {
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
    lineHeight: "19.5px",
  },
  section: {
    gap: "16px",
    marginTop: "32px",
  },
  sectionFollowing: {
    marginTop: "48px",
  },
  sectionTitle: {
    fontSize: "15px",
    fontWeight: 520,
    lineHeight: "20px",
    margin: "0 0 0 16px",
  },
  selectTrigger: {
    backgroundColor: {
      default: "var(--color-surface-control)",
      ":hover": "var(--color-surface-overlay-hover)",
      "[data-visual-state=hover]": "var(--color-surface-overlay-hover)",
    },
    borderColor: {
      default: "var(--color-border-control)",
      ":disabled": "var(--color-border-tertiary)",
      ":focus-visible": "var(--color-border-control-focus)",
      ":hover": "transparent",
      "[data-popup-open]": "var(--color-border-control-focus)",
      "[data-visual-state=hover]": "transparent",
    },
    borderRadius: "8px",
    borderStyle: "solid",
    borderWidth: "0.5px",
    boxShadow: "none",
    fontSize: "13px",
    height: "32px",
    justifyContent: "space-between",
    minWidth: "86px",
    paddingInline: "11px",
    width: "auto",
  },
});
