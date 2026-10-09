import * as stylex from "@stylexjs/stylex";

export const iconButtonStyles = stylex.create({
  focus: {
    outline: { default: null, ":focus-visible": "2px solid var(--focus)" },
    outlineOffset: { default: null, ":focus-visible": 4 },
  },
  iconButton: {
    width: { default: 36, "@media (pointer: coarse)": 44 },
    height: { default: 36, "@media (pointer: coarse)": 44 },
    minWidth: { default: 36, "@media (pointer: coarse)": 44 },
    minHeight: { default: 36, "@media (pointer: coarse)": 44 },
    padding: 0,
    flexShrink: 0,
  },
  iconGlyph: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tooltip: {
    maxWidth: "min(280px, calc(100vw - 32px))",
    overflowWrap: "anywhere",
  },
});
