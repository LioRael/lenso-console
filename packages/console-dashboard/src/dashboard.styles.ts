import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  page: {
    paddingBottom: { default: 80, "@media (max-width: 640px)": 144 },
    minWidth: 0,
  },
  bottomCorner: {
    marginBottom: { default: 0, "@media (max-width: 640px)": 64 },
  },
  hiddenTitle: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
  group: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  editor: {
    padding: 16,
  },
  widgetChoices: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
  },
  widgetChoice: {
    minHeight: 44,
    justifyContent: "flex-start",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  card: {
    backgroundColor: "var(--surface-secondary)",
    color: "var(--foreground)",
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 12,
    boxShadow: "none",
    minWidth: 0,
    overflow: "auto",
  },
  editingCard: {
    backgroundColor: "var(--surface-secondary)",
    borderColor: "var(--border)",
  },
  selected: {
    borderColor: "var(--focus)",
    outline: "2px solid var(--focus)",
    outlineOffset: 2,
  },
  header: {
    display: "flex",
    gap: 4,
    alignItems: "center",
    flexWrap: "wrap",
    padding: 4,
    paddingRight: 52,
  },
  title: { margin: 0, fontSize: 16, overflowWrap: "anywhere", flexGrow: 1 },
  content: {
    paddingBlock: 12,
    paddingInline: 12,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  controls: { display: "flex", flexWrap: "wrap", gap: 12, paddingBlock: 12 },
  geometryGroup: { borderWidth: 0, padding: 0, margin: 0, minWidth: 0 },
  status: { marginBlock: 12 },
  button: {
    minHeight: 44,
    minWidth: 44,
  },
  cornerButton: {
    minHeight: { default: 36, "@media (pointer: coarse)": 44 },
    minWidth: { default: 36, "@media (pointer: coarse)": 44 },
  },
  handle: {
    cursor: "grab",
    touchAction: "none",
    flexGrow: 1,
    justifyContent: "space-between",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    textAlign: "left",
  },
  remove: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: "50%",
  },
  grid: { minWidth: 0 },
});
