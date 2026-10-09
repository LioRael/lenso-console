import * as stylex from "@stylexjs/stylex";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";

export const pluginWorkbenchStyles = stylex.create({
  body: { display: "grid", gap: 16, minWidth: 0 },
  filterOptions: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    borderWidth: 0,
    margin: 0,
    padding: 0,
    minWidth: 0,
  },
  filterField: { display: "grid", gap: 8, minWidth: 0 },
  filterLabel: { color: tokens.colorContentSecondary, fontSize: 12 },
  workbench: {
    marginInline: { default: 26, "@media (max-width: 760px)": 16 },
    paddingBlock: {
      default: "30px 64px",
      "@media (max-width: 560px)": "24px 48px",
    },
    width: {
      default: "min(1120px, calc(100% - 52px))",
      "@media (max-width: 760px)": "calc(100% - 32px)",
    },
    display: "grid",
    gap: 24,
    minWidth: 0,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    width: "100%",
    flexWrap: "wrap",
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginInlineStart: "auto",
  },
  search: {
    minWidth: 0,
    maxWidth: "100%",
    flex: "0 1 320px",
    "@media (max-width: 560px)": { flex: "1 1 100%" },
  },
  inventory: {
    minWidth: 0,
  },
  summary: {
    display: "block",
    color: tokens.colorContentSecondary,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    paddingBlock: "4px 12px",
    borderBottom: "1px solid var(--separator)",
  },
  table: { tableLayout: "fixed" },
  identity: { display: "grid", gap: 4, minWidth: 0 },
  page: {
    backgroundColor: tokens.colorSurfaceCanvas,
    color: tokens.colorContentPrimary,
    minWidth: 0,
    minHeight: "100%",
    width: "100%",
  },
  primary: {
    color: tokens.colorContentPrimary,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: "20px",
    overflowWrap: "anywhere",
  },
  row: {
    cursor: "pointer",
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${tokens.colorFocusRing}`,
    },
    outlineOffset: -2,
  },
  status: { textAlign: "right" },
  identifier: { overflowWrap: "anywhere" },
  secondary: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    fontWeight: 400,
    lineHeight: "16px",
    overflowWrap: "anywhere",
  },
  state: {
    alignContent: "center",
    color: tokens.colorContentTertiary,
    display: "grid",
    gap: tokens.space3,
    justifyItems: "start",
    minHeight: 200,
    padding: "32px 0",
  },
  stateDescription: {
    fontSize: 13,
    lineHeight: "20px",
    margin: 0,
    maxWidth: 420,
  },
  stateTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
  },
});
