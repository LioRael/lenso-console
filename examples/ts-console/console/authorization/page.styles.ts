import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  page: {
    display: "grid",
    gap: 40,
    maxWidth: 1120,
    marginInline: "auto",
    paddingInline: 16,
    paddingBlockStart: 8,
    paddingBlockEnd: 120,
    minWidth: 0,
    color: "var(--foreground)",
    overflowWrap: "anywhere",
  },
  section: { display: "grid", gap: 16, minWidth: 0 },
  heading: { margin: 0, fontSize: 16, fontWeight: 500, lineHeight: 1.5 },
  table: { width: "100%", tableLayout: "fixed" },
  cell: {
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    verticalAlign: "top",
  },
  list: {
    listStyleType: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: 12,
  },
  secondary: {
    marginBlockStart: 4,
    marginBlockEnd: 0,
    fontSize: 12,
    lineHeight: 1.6,
    color: "color-mix(in oklab, var(--muted) 90%, var(--foreground) 10%)",
  },
  description: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: "color-mix(in oklab, var(--muted) 90%, var(--foreground) 10%)",
  },
  information: {
    display: "grid",
    gap: 16,
    padding: 20,
    width: "min(360px, calc(100vw - 32px))",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    overflowWrap: "anywhere",
  },
});
