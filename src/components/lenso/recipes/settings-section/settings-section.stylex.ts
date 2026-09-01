import * as stylex from "@stylexjs/stylex";

export const settingsSectionStyles = stylex.create({
  description: {
    color: "var(--color-content-tertiary)",
    fontFamily: "var(--font-sans)",
    fontSize: "13px",
    lineHeight: 1.5,
    margin: 0,
    maxWidth: "68ch",
  },
  group: {
    gap: 0,
    overflow: "hidden",
    padding: 0,
    width: "100%",
  },
  lastRow: {
    borderBottomWidth: "0px",
  },
  header: {
    display: "grid",
    gap: "var(--space-1, 4px)",
  },
  root: {
    display: "grid",
    gap: "var(--space-3, 12px)",
  },
  title: {
    color: "var(--color-content-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: 1.4,
    margin: 0,
  },
});
