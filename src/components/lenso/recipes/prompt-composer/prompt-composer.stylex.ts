import * as stylex from "@stylexjs/stylex";

export const promptComposerStyles = stylex.create({
  actions: {
    alignItems: "center",
    display: "flex",
    gap: "var(--space-1, 4px)",
  },
  input: {
    backgroundColor: "transparent",
    borderWidth: 0,
    boxSizing: "border-box",
    color: {
      default: "var(--color-content-primary)",
      "::placeholder": "var(--color-content-tertiary)",
    },
    font: "inherit",
    fontFamily: "var(--font-sans)",
    fontSize: "14px",
    lineHeight: 1.5,
    margin: 0,
    maxWidth: "100%",
    minWidth: 0,
    outlineStyle: "none",
    outlineWidth: 0,
    overflowWrap: "anywhere",
    padding: 0,
    resize: "none",
    width: "100%",
  },
  root: {
    boxSizing: "border-box",
    display: "grid",
    gap: "var(--space-2, 8px)",
    minWidth: 0,
    padding: "var(--space-3, 12px)",
    width: "100%",
  },
  surface: {
    borderColor: {
      default: null,
      "@media (forced-colors: active)": "CanvasText",
    },
    borderStyle: {
      default: null,
      "@media (forced-colors: active)": "solid",
    },
    borderWidth: {
      default: null,
      "@media (forced-colors: active)": "1px",
    },
    overflow: "hidden",
    padding: 0,
    width: "100%",
  },
  toolbar: {
    alignItems: "center",
    display: "flex",
    gap: "var(--space-2, 8px)",
    justifyContent: "space-between",
    minWidth: 0,
  },
});
