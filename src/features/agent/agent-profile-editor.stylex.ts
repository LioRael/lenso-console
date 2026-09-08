import * as stylex from "@stylexjs/stylex";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";

export const profileStyles = stylex.create({
  root: { display: "grid", gap: 16, marginBlockStart: 24 },
  heading: { fontSize: 16, fontWeight: 600, margin: 0 },
  toolbar: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 },
  selector: {
    minWidth: 180,
    maxWidth: "100%",
    justifyContent: "space-between",
  },
  fields: {
    display: "grid",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: tokens.colorSurfaceSubtle,
  },
  field: { display: "grid", gap: 6, fontSize: 12 },
  input: { width: "100%", maxWidth: "none" },
  textarea: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: 96,
    resize: "vertical",
    borderRadius: 12,
    padding: 12,
    border: "1px solid var(--color-border-tertiary)",
    backgroundColor: tokens.colorSurfaceCanvas,
    color: tokens.colorContentPrimary,
    fontFamily: "inherit",
    fontSize: 13,
    lineHeight: "20px",
  },
  group: {
    border: "1px solid var(--color-border-tertiary)",
    borderRadius: 16,
    overflow: "hidden",
  },
  summary: { padding: 16, cursor: "pointer", fontSize: 13, fontWeight: 500 },
  groupBody: { paddingBlockEnd: 8 },
  count: {
    marginInlineStart: 8,
    color: tokens.colorContentTertiary,
    fontWeight: 400,
    fontSize: 12,
  },
  status: { fontSize: 12, color: tokens.colorContentTertiary },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBlock: 8,
  },
  statusStart: { marginInlineEnd: "auto" },
});
