import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  page: { padding: 20, paddingTop: 72, paddingBottom: 144, minWidth: 0 },
  heading: { fontSize: 20, marginTop: 0, marginBottom: 12 },
  group: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  card: {
    backgroundColor: "var(--surface)",
    color: "var(--surface-foreground)",
    borderColor: "var(--border)",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 12,
    minWidth: 0,
    overflow: "auto",
  },
  selected: {
    borderColor: "var(--focus)",
    outline: "2px solid var(--focus)",
    outlineOffset: 2,
  },
  header: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    padding: 12,
  },
  title: { margin: 0, fontSize: 16, overflowWrap: "anywhere" },
  content: {
    padding: 12,
    paddingTop: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  controls: { display: "flex", flexWrap: "wrap", gap: 8, padding: 12 },
  status: { marginBlock: 12 },
  button: { minHeight: 44, minWidth: 44 },
  handle: { cursor: "grab", touchAction: "none" },
  grid: { minWidth: 0 },
});
