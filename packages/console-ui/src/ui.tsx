/* eslint-disable func-style, jsx-a11y/prefer-tag-over-role, no-negated-condition, sort-keys */

import * as stylex from "@stylexjs/stylex";
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ElementType,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { createContext, useContext } from "react";

import { tokens } from "./console-ui-tokens.stylex";

export const pageStyles = stylex.create({
  surfaceRoot: {
    height: "100%",
    minHeight: 0,
    minWidth: 0,
  },
  page: {
    backgroundColor: tokens.canvas,
    color: tokens.foreground,
    display: "block",
    height: "100%",
    minHeight: "100%",
    overflow: "auto",
  },
  pageHeader: {
    alignItems: "flex-start",
    backgroundColor: tokens.canvas,
    borderBottomColor: tokens.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: tokens.space3,
    minHeight: 96,
    paddingBlockEnd: 7,
    paddingBlockStart: tokens.space8,
    paddingInline: tokens.pageGutter,
    width: "100%",
    "@media (max-width: 720px)": { flexDirection: "column" },
  },
  pageHeading: { minWidth: 0 },
  pageEyebrow: {
    color: tokens.foregroundTertiary,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.12em",
    lineHeight: 1.4,
    marginBlockEnd: 1,
    marginBlockStart: 0,
    textTransform: "uppercase",
  },
  pageTitle: {
    color: tokens.foreground,
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: "32px",
    margin: 0,
  },
  pageDescription: {
    color: tokens.foregroundTertiary,
    fontSize: 13,
    lineHeight: "20px",
    marginBlockEnd: 0,
    marginBlockStart: 4,
    maxWidth: 760,
  },
  pageActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginInlineStart: "auto",
    "@media (max-width: 720px)": { marginInlineStart: 0 },
  },
  pageBody: {
    minHeight: 0,
    overflow: "hidden",
    paddingBlockEnd: 48,
    paddingInline: tokens.pageGutter,
    width: "100%",
  },
  pageFilters: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space2,
    height: 48,
  },
  pageNoData: {
    color: tokens.foregroundTertiary,
    fontSize: 12,
    paddingBlock: tokens.space8,
  },
});

export const controlStyles = stylex.create({
  button: {
    alignItems: "center",
    backgroundColor: tokens.control,
    borderColor: tokens.line,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowControl,
    color: tokens.foreground,
    display: "inline-flex",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 500,
    gap: tokens.space1_5,
    justifyContent: "center",
    lineHeight: 1,
    minHeight: tokens.controlHeightSm,
    paddingInline: 10,
    transitionDuration: "120ms",
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: "ease",
    whiteSpace: "nowrap",
    ":active:not(:disabled)": { backgroundColor: tokens.controlActive },
    ":disabled": { opacity: 0.45 },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
    ":hover:not(:disabled)": { backgroundColor: tokens.controlHover },
  },
  buttonMd: {
    fontSize: 13,
    minHeight: tokens.controlHeightMd,
    paddingInline: 12,
  },
  buttonPrimary: {
    backgroundColor: tokens.accent,
    borderColor: tokens.accent,
    color: tokens.accentForeground,
    ":hover:not(:disabled)": {
      backgroundColor: tokens.accentHover,
      borderColor: tokens.accentHover,
    },
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
    color: tokens.foregroundSecondary,
    ":hover:not(:disabled)": {
      backgroundColor: tokens.rowHover,
      color: tokens.foreground,
    },
  },
  buttonDanger: {
    backgroundColor: tokens.toneErrorBg,
    borderColor: tokens.toneErrorBorder,
    color: tokens.toneErrorForeground,
  },
  iconButton: {
    minWidth: tokens.controlHeightSm,
    paddingInline: 0,
    width: tokens.controlHeightSm,
  },
  iconButtonMd: {
    minWidth: tokens.controlHeightMd,
    width: tokens.controlHeightMd,
  },
  badge: {
    alignItems: "center",
    backgroundColor: tokens.toneMutedBg,
    borderColor: tokens.toneMutedBorder,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.toneMutedForeground,
    display: "inline-flex",
    fontSize: 11,
    fontWeight: 500,
    gap: tokens.space1_5,
    lineHeight: 1.2,
    minHeight: 22,
    paddingBlock: 2,
    paddingInline: 7,
  },
  badgeInfo: {
    backgroundColor: tokens.toneInfoBg,
    borderColor: tokens.toneInfoBorder,
    color: tokens.toneInfoForeground,
  },
  badgeSuccess: {
    backgroundColor: tokens.toneSuccessBg,
    borderColor: tokens.toneSuccessBorder,
    color: tokens.toneSuccessForeground,
  },
  badgeWarning: {
    backgroundColor: tokens.toneWarningBg,
    borderColor: tokens.toneWarningBorder,
    color: tokens.toneWarningForeground,
  },
  badgeDanger: {
    backgroundColor: tokens.toneErrorBg,
    borderColor: tokens.toneErrorBorder,
    color: tokens.toneErrorForeground,
  },
  inlineStatus: {
    alignItems: "center",
    color: tokens.foregroundSecondary,
    columnGap: 7,
    display: "inline-grid",
    fontSize: 11,
    gridTemplateColumns: "6px minmax(0, auto)",
    lineHeight: "16px",
    minHeight: 16,
    whiteSpace: "nowrap",
  },
  inlineStatusTop: { alignItems: "start" },
  inlineStatusDot: {
    backgroundColor: tokens.foregroundTertiary,
    borderRadius: tokens.radiusPill,
    flex: "none",
    height: 6,
    width: 6,
  },
  inlineStatusDotTop: { marginBlockStart: 5 },
  inlineStatusDotInfo: { backgroundColor: tokens.info },
  inlineStatusDotSuccess: { backgroundColor: tokens.success },
  inlineStatusDotWarning: { backgroundColor: tokens.warning },
  inlineStatusDotDanger: { backgroundColor: tokens.error },
  inlineStatusLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  iconSlot: {
    alignItems: "center",
    display: "inline-grid",
    flex: "0 0 16px",
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  iconSlot12: { flexBasis: 12, height: 12, width: 12 },
  iconSlot20: { flexBasis: 20, height: 20, width: 20 },
  filterControl: {
    alignItems: "center",
    backgroundColor: tokens.control,
    borderColor: tokens.lineStrong,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.foregroundSecondary,
    display: "inline-flex",
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 500,
    gap: tokens.space2,
    height: tokens.controlHeightSm,
    lineHeight: "16px",
    minHeight: tokens.controlHeightSm,
    paddingInline: 10,
    whiteSpace: "nowrap",
    ":hover:not(:disabled)": {
      backgroundColor: tokens.controlHover,
      color: tokens.foreground,
    },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  filterControlLabel: { overflow: "hidden", textOverflow: "ellipsis" },
  filterSelectRoot: {
    display: "inline-flex",
    height: tokens.controlHeightSm,
    minHeight: tokens.controlHeightSm,
    minWidth: 0,
    position: "relative",
  },
  filterSelect: {
    appearance: "none",
    backgroundColor: tokens.control,
    borderColor: tokens.lineStrong,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.foregroundSecondary,
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 500,
    height: tokens.controlHeightSm,
    lineHeight: "16px",
    minHeight: tokens.controlHeightSm,
    minWidth: 0,
    paddingBlock: 0,
    paddingInlineEnd: 28,
    paddingInlineStart: 10,
    width: "100%",
    whiteSpace: "nowrap",
    ":hover:not(:disabled)": {
      backgroundColor: tokens.controlHover,
      color: tokens.foreground,
    },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  filterSelectIcon: {
    color: tokens.foregroundTertiary,
    pointerEvents: "none",
    position: "absolute",
    right: 8,
    top: 8,
  },
});

export const dataStyles = stylex.create({
  paneHeader: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space2,
    height: tokens.paneHeaderHeight,
    justifyContent: "space-between",
    minHeight: tokens.paneHeaderHeight,
    overflow: "hidden",
    paddingInline: 10,
    whiteSpace: "nowrap",
  },
  paneHeaderTitle: {
    color: tokens.foreground,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: "17px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  paneHeaderMeta: {
    color: tokens.foregroundTertiary,
    flex: "none",
    fontSize: 10,
    lineHeight: "14px",
  },
  surfaceGroupLabel: {
    alignItems: "center",
    color: tokens.foregroundTertiary,
    display: "flex",
    gap: 6,
    height: 32,
    minHeight: 32,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInlineEnd: 8,
    paddingInlineStart: 10,
  },
  surfaceGroupLabelText: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.4px",
    lineHeight: "14px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tableHeader: {
    alignItems: "center",
    color: tokens.foregroundTertiary,
    display: "grid",
    fontSize: 10,
    fontWeight: 500,
    gridTemplateColumns: "320px 120px 170px 122px",
    height: tokens.tableHeaderHeight,
    lineHeight: "14px",
    minHeight: tokens.tableHeaderHeight,
    minWidth: 732,
    whiteSpace: "nowrap",
  },
  tableHeaderProvider: { gridTemplateColumns: "260px 220px 160px 92px" },
  tableHeaderRuntime: {
    gridTemplateColumns: "250px 110px 140px 120px 86px",
    minWidth: 706,
  },
  tableHeaderCell: {
    minWidth: 0,
    overflow: "hidden",
    paddingInlineStart: 0,
    textOverflow: "ellipsis",
  },
  tableHeaderCellFirst: { paddingInlineStart: 10 },
  dataRow: {
    alignItems: "center",
    color: tokens.foregroundSecondary,
    display: "grid",
    fontSize: 11,
    gridTemplateColumns: "320px 120px 170px 122px",
    height: tokens.tableRowHeight,
    lineHeight: "16px",
    minHeight: tokens.tableRowHeight,
    minWidth: 732,
    overflow: "hidden",
    textAlign: "left",
  },
  dataRowProvider: { gridTemplateColumns: "260px 220px 160px 92px" },
  dataRowRuntime: {
    gridTemplateColumns: "250px 110px 140px 120px 86px",
    minWidth: 706,
  },
  dataRowSelected: { backgroundColor: tokens.rowSelected },
  dataRowInteractive: {
    ":hover": { backgroundColor: tokens.rowHover },
    ":focus-visible": {
      backgroundColor: tokens.rowHover,
      outlineColor: tokens.focusRing,
      outlineOffset: -2,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  dataRowPrimary: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 0,
    overflow: "hidden",
    paddingInlineStart: 10,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dataRowPrimaryText: {
    color: tokens.foreground,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "16px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dataRowSecondaryText: {
    color: tokens.foregroundTertiary,
    fontFamily: tokens.fontCode,
    fontSize: 10,
    lineHeight: "14px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dataRowCell: {
    minWidth: 0,
    overflow: "hidden",
    paddingInlineStart: 0,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dataGrid: {
    backgroundColor: tokens.lineSubtle,
    display: "flex",
    flexDirection: "column",
    gap: 1,
    minWidth: 0,
    overflowX: "auto",
  },
  panel: {
    backgroundColor: tokens.panel,
    borderColor: tokens.line,
    borderRadius: 0,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowPanel,
    overflow: "hidden",
  },
  panelHeader: {
    alignItems: "center",
    backgroundColor: tokens.panelHeader,
    borderBottomColor: tokens.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: tokens.space3,
    justifyContent: "space-between",
    minHeight: 40,
    paddingBlock: 6,
    paddingInline: 10,
  },
  panelTitle: {
    color: tokens.foreground,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.4,
    margin: 0,
  },
  panelDescription: {
    color: tokens.foregroundTertiary,
    fontSize: 12,
    lineHeight: 1.5,
    marginBlockEnd: 0,
    marginBlockStart: 2,
  },
  panelContentSm: { padding: tokens.space3 },
  panelContentMd: { padding: tokens.space4 },
  summary: {
    backgroundColor: tokens.panel,
    borderBottomColor: tokens.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gridAutoColumns: "minmax(110px, 1fr)",
    gridAutoFlow: "column",
    overflowX: "auto",
  },
  summaryItem: {
    alignContent: "center",
    borderRightColor: tokens.line,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    display: "grid",
    gap: "2px 8px",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: 52,
    paddingBlock: 7,
    paddingInline: 12,
    ":last-child": { borderRightWidth: 0 },
  },
  summaryLabel: {
    color: tokens.foregroundTertiary,
    fontSize: 9,
    letterSpacing: "0.08em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  summaryValue: {
    color: tokens.foreground,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  summaryValueWarning: { color: tokens.toneWarningForeground },
  summaryValueDanger: { color: tokens.toneErrorForeground },
  summaryValueSuccess: { color: tokens.toneSuccessForeground },
  summaryNote: {
    color: tokens.foregroundTertiary,
    fontSize: 10,
    gridColumn: "1 / -1",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export const layoutStyles = stylex.create({
  splitView: {
    display: "grid",
    gridTemplateColumns: `minmax(0, 1fr) ${tokens.inspectorWidth}`,
    minHeight: 0,
    overflow: "hidden",
    "@media (max-width: 720px)": {
      gridTemplateColumns: "1fr",
      gridTemplateRows: "minmax(220px, 1fr) minmax(180px, auto)",
    },
  },
  splitViewDynamic: (inspectorWidth: number) => ({
    gridTemplateColumns: `minmax(0, 1fr) ${inspectorWidth}px`,
  }),
  splitViewPane: {
    backgroundColor: tokens.canvas,
    minHeight: 0,
    minWidth: 0,
    overflow: "auto",
  },
  splitViewMain: { paddingInlineEnd: 28 },
  splitViewInspector: {
    borderInlineStartColor: tokens.lineSubtle,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    paddingBlockStart: 28,
    paddingInlineStart: 28,
    "@media (max-width: 720px)": {
      borderBlockStartColor: tokens.line,
      borderBlockStartStyle: "solid",
      borderBlockStartWidth: 1,
      borderInlineStartStyle: "none",
      borderInlineStartWidth: 0,
    },
  },
  splitViewNone: { padding: 0 },
  inspector: {
    backgroundColor: tokens.canvas,
    minWidth: 0,
    overflow: "hidden",
  },
  inspectorHeader: { minWidth: 0, padding: 28 },
  inspectorHeaderWithAction: {
    alignItems: "flex-start",
    display: "flex",
    gap: tokens.space4,
    justifyContent: "space-between",
  },
  inspectorHeaderContent: { minWidth: 0 },
  inspectorHeaderAction: { flex: "none" },
  inspectorTitle: {
    color: tokens.foreground,
    fontSize: 18,
    fontWeight: 600,
    lineHeight: "26px",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  inspectorSubtitle: {
    color: tokens.foregroundTertiary,
    fontFamily: tokens.fontCode,
    fontSize: 10,
    lineHeight: "14px",
    marginBlockEnd: 0,
    marginBlockStart: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  inspectorStatus: { marginBlockStart: 16 },
  inspectorSection: {
    borderBlockStartColor: tokens.line,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    minWidth: 0,
    paddingBlock: tokens.space4,
    paddingInline: 28,
  },
  inspectorSectionTitle: {
    color: tokens.foregroundSecondary,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: "16px",
    marginBlockEnd: tokens.space2,
    marginBlockStart: 0,
  },
  inspectorSectionBody: {
    color: tokens.foreground,
    fontSize: 12,
    lineHeight: 1.55,
  },
  inspectorActions: {
    borderBlockStartColor: tokens.line,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.space2,
    paddingBlock: tokens.space4,
    paddingInline: 28,
  },
  section: {
    backgroundColor: tokens.canvas,
    borderBlockEndColor: tokens.line,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    minWidth: 0,
  },
  sectionHeader: {
    alignItems: "center",
    backgroundColor: tokens.canvas,
    borderBlockEndColor: tokens.line,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    display: "flex",
    gap: tokens.space2,
    minHeight: 50,
    paddingInline: 10,
  },
  sectionTitle: {
    color: tokens.foreground,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 0,
    margin: 0,
  },
  sectionMeta: {
    color: tokens.foregroundTertiary,
    fontSize: 10,
    marginInlineStart: "auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sectionBody: { minWidth: 0 },
  keyValuesRow: {
    alignItems: "center",
    borderBlockEndColor: tokens.lineSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    display: "grid",
    fontSize: 11,
    gap: 10,
    gridTemplateColumns: "112px minmax(0, 1fr)",
    minHeight: 34,
    paddingBlock: 5,
    paddingInline: 10,
    ":last-child": { borderBottomWidth: 0 },
  },
  keyValuesLabel: { color: tokens.foregroundTertiary },
  keyValuesValue: {
    color: tokens.foregroundSecondary,
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  state: {
    alignContent: "center",
    color: tokens.foregroundTertiary,
    display: "grid",
    gap: 6,
    justifyItems: "center",
    minHeight: 180,
    padding: tokens.space6,
    textAlign: "center",
  },
  stateIcon: { display: "grid", height: 24, placeItems: "center", width: 24 },
  stateTitle: { color: tokens.foreground, fontSize: 12, fontWeight: 600 },
  stateDescription: {
    fontSize: 11,
    lineHeight: 1.5,
    margin: 0,
    maxWidth: 460,
  },
  stateAction: { marginBlockStart: 4 },
  tabsList: {
    alignItems: "stretch",
    borderBlockEndColor: tokens.line,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    display: "flex",
    gap: 4,
    minWidth: 0,
  },
  tabsListPage: { gap: tokens.space4, height: tokens.tabHeight },
  tabsListInspector: { gap: tokens.space3, height: tokens.tabHeight },
  tabsListInsetSm: { paddingInline: tokens.space2 },
  tabsTab: {
    alignItems: "center",
    backgroundColor: "transparent",
    border: 0,
    color: tokens.foregroundTertiary,
    display: "inline-flex",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 500,
    gap: tokens.space1_5,
    justifyContent: "center",
    minHeight: 32,
    paddingInline: 4,
    position: "relative",
    whiteSpace: "nowrap",
    ":first-child": { paddingInlineStart: 0 },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: -3,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
    ":hover": { color: tokens.foreground },
  },
  tabsTabDense: { minHeight: tokens.tabHeight, paddingInline: 0 },
  tabsTabSelected: {
    color: tokens.foreground,
    ":after": {
      backgroundColor: tokens.accent,
      bottom: -1,
      content: '""',
      height: 1,
      position: "absolute",
      left: 4,
      right: 4,
    },
    ":first-child:after": { left: 0 },
  },
  tabsTabSelectedDense: { ":after": { left: 0, right: 0 } },
  tabsTabSelectedLeadingIcon: { ":first-child:after": { left: 4 } },
  tabsPanel: { minWidth: 0 },
});

export const settingsStyles = stylex.create({
  settingsGroup: {
    borderBlockStartColor: tokens.line,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
  },
  settingsGroupHeader: {
    paddingBlockEnd: tokens.space2,
    paddingBlockStart: tokens.space4,
    paddingInline: tokens.contentGutter,
  },
  settingsGroupTitle: {
    color: tokens.foreground,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.4,
    margin: 0,
  },
  settingsGroupDescription: {
    color: tokens.foregroundTertiary,
    fontSize: 12,
    lineHeight: 1.5,
    marginBlockEnd: 0,
    marginBlockStart: tokens.space1,
  },
  settingsRow: {
    alignItems: "center",
    borderBlockStartColor: tokens.lineSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    display: "grid",
    gap: tokens.space6,
    gridTemplateColumns: "minmax(0, 1fr) minmax(180px, 280px)",
    minHeight: 54,
    paddingBlock: tokens.space2,
    paddingInline: tokens.contentGutter,
    "@media (max-width: 720px)": {
      gap: tokens.space2,
      gridTemplateColumns: "1fr",
      paddingBlock: tokens.space3,
    },
  },
  settingsRowCopy: { minWidth: 0 },
  settingsRowLabel: {
    color: tokens.foreground,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.4,
  },
  settingsRowDescription: {
    color: tokens.foregroundTertiary,
    fontSize: 11,
    lineHeight: 1.45,
    marginBlockStart: 2,
  },
  settingsRowControl: { minWidth: 0 },

  settingsToggle: {
    borderRadius: tokens.radiusPill,
    borderStyle: "solid",
    borderWidth: 1,
    height: 16,
    position: "relative",
    transitionDuration: "120ms",
    transitionProperty: "background-color, border-color",
    transitionTimingFunction: "ease",
    width: 28,
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  settingsToggleOn: {
    backgroundColor: tokens.foreground,
    borderColor: tokens.foreground,
  },
  settingsToggleOff: {
    backgroundColor: tokens.control,
    borderColor: tokens.lineStrong,
  },
  settingsToggleKnob: {
    borderRadius: tokens.radiusPill,
    height: 10,
    left: 2,
    position: "absolute",
    top: 2,
    transitionDuration: "120ms",
    transitionProperty: "background-color, transform",
    transitionTimingFunction: "ease",
    width: 10,
  },
  settingsToggleKnobOn: {
    backgroundColor: tokens.canvas,
    transform: "translateX(13px)",
  },
  settingsToggleKnobOff: {
    backgroundColor: tokens.foregroundTertiary,
    transform: "translateX(0.5px)",
  },
});

export const formStyles = stylex.create({
  field: { display: "grid", gap: "6px" },
  fieldLabel: {
    color: tokens.foregroundSecondary,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.4,
  },
  fieldHint: {
    color: tokens.foregroundTertiary,
    fontSize: 11,
    lineHeight: 1.5,
    margin: 0,
  },
  fieldError: {
    color: tokens.toneErrorForeground,
    fontSize: 11,
    lineHeight: 1.5,
    margin: 0,
  },
  input: {
    backgroundColor: tokens.control,
    borderColor: tokens.line,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowControl,
    color: tokens.foreground,
    fontFamily: "inherit",
    fontSize: 13,
    minHeight: tokens.controlHeightMd,
    paddingInline: 10,
    width: "100%",
    "::placeholder": { color: tokens.foregroundQuaternary },
    ":focus-visible": {
      borderColor: tokens.lineStrong,
      boxShadow: `inset 0 0 0 1px ${tokens.focusRingMuted}`,
      outline: "none",
    },
  },
  textarea: {
    lineHeight: 1.5,
    minHeight: 88,
    paddingBlock: tokens.space2,
    resize: "vertical",
  },
  emptyState: {
    alignContent: "center",
    color: tokens.foregroundTertiary,
    display: "grid",
    gap: tokens.space2,
    justifyItems: "center",
    minHeight: 180,
    padding: tokens.space8,
    textAlign: "center",
  },
  emptyStateIcon: {
    color: tokens.foregroundTertiary,
    display: "grid",
    height: 32,
    placeItems: "center",
    width: 32,
  },
  emptyStateTitle: {
    color: tokens.foreground,
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  emptyStateDescription: {
    color: tokens.foregroundTertiary,
    fontSize: 12,
    lineHeight: 1.55,
    margin: 0,
    maxWidth: 440,
  },
});

export const tableStyles = stylex.create({
  tableWrap: { overflowX: "auto" },
  table: {
    borderCollapse: "collapse",
    color: tokens.foregroundSecondary,
    fontSize: 12,
    textAlign: "left",
    width: "100%",
  },
  tableHead: {
    borderBlockEndColor: tokens.line,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    color: tokens.foregroundTertiary,
  },
  tableRow: {
    borderBlockEndColor: tokens.lineSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    ":hover": { backgroundColor: tokens.rowHover },
    ":last-child": { borderBottomWidth: 0 },
  },
  dataTableHeaderCell: {
    fontSize: 10,
    fontWeight: 500,
    height: 38,
    paddingInline: 10,
  },
  dataTableCell: { height: 64, paddingInline: 10 },
});

export type ConsoleStyle =
  | stylex.CompiledStyles
  | readonly ConsoleStyle[]
  | false
  | null
  | undefined;

type StyleXElementProps<T extends ElementType> = Omit<
  ComponentPropsWithoutRef<T>,
  "className" | "style"
>;
type StyleXButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "style"
>;
type StyleXSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className" | "style"
>;
type StyleXTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className" | "style"
>;

/** Private ownership map for the React primitives in this module. */
const componentStyles = {
  ...pageStyles,
  ...controlStyles,
  ...dataStyles,
  ...layoutStyles,
  ...settingsStyles,
  ...formStyles,
  ...tableStyles,
};

export type ConsoleSurfaceRootProps = PropsWithChildren<
  StyleXElementProps<"div"> & {
    moduleId?: string;
    surfaceId?: string;
    stylex?: ConsoleStyle;
  }
>;

/** Stable root node for Module Surface styling and Figma-frame targeting. */
export function SurfaceRoot({
  children,
  moduleId,
  stylex: stylexStyle,
  surfaceId,
  ...props
}: ConsoleSurfaceRootProps) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.surfaceRoot)}
      data-ui="surface-root"
      data-lenso-surface-root="true"
      data-module-id={moduleId}
      data-surface-id={surfaceId}
      {...props}
    >
      {children}
    </div>
  );
}

type ConsolePageProps = PropsWithChildren<
  StyleXElementProps<"main"> & {
    scroll?: boolean;
    stylex?: ConsoleStyle;
  }
>;

function ConsolePageRoot({
  children,
  scroll = true,
  stylex: stylexStyle,
  ...props
}: ConsolePageProps) {
  return (
    <main
      {...stylex.props(stylexStyle, componentStyles.page)}
      data-ui="page"
      data-scroll={scroll ? "true" : "false"}
      {...props}
    >
      {children}
    </main>
  );
}

function ConsolePageHeader({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"header"> & { stylex?: ConsoleStyle }
>) {
  return (
    <header
      {...stylex.props(stylexStyle, componentStyles.pageHeader)}
      data-ui="page__header"
      {...props}
    >
      {children}
    </header>
  );
}

function ConsolePageHeading({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.pageHeading)}
      data-ui="page__heading"
      {...props}
    >
      {children}
    </div>
  );
}

function ConsolePageEyebrow({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"p"> & { stylex?: ConsoleStyle }>) {
  return (
    <p
      {...stylex.props(stylexStyle, componentStyles.pageEyebrow)}
      data-ui="page__eyebrow"
      {...props}
    >
      {children}
    </p>
  );
}

function ConsolePageTitle({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"h1"> & { stylex?: ConsoleStyle }>) {
  return (
    <h1
      {...stylex.props(stylexStyle, componentStyles.pageTitle)}
      data-ui="page__title"
      {...props}
    >
      {children}
    </h1>
  );
}

function ConsolePageDescription({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"p"> & { stylex?: ConsoleStyle }>) {
  return (
    <p
      {...stylex.props(stylexStyle, componentStyles.pageDescription)}
      data-ui="page__description"
      {...props}
    >
      {children}
    </p>
  );
}

function ConsolePageActions({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.pageActions)}
      data-ui="page__actions"
      {...props}
    >
      {children}
    </div>
  );
}

function ConsolePageBody({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.pageBody)}
      data-ui="page__body"
      {...props}
    >
      {children}
    </div>
  );
}

export const ConsolePage = Object.assign(ConsolePageRoot, {
  Actions: ConsolePageActions,
  Body: ConsolePageBody,
  Description: ConsolePageDescription,
  Eyebrow: ConsolePageEyebrow,
  Header: ConsolePageHeader,
  Heading: ConsolePageHeading,
  Title: ConsolePageTitle,
});

export type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "ghost"
  | "danger";
export type ControlSize = "sm" | "md";

export type ButtonProps = PropsWithChildren<
  StyleXButtonProps & {
    size?: ControlSize;
    stylex?: ConsoleStyle;
    variant?: ButtonVariant;
  }
>;

export function Button({
  children,
  size = "sm",
  stylex: stylexStyle,
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      {...stylex.props(
        stylexStyle,
        componentStyles.button,
        size === "md" ? componentStyles.buttonMd : null,
        variant === "primary" ? componentStyles.buttonPrimary : null,
        variant === "ghost" ? componentStyles.buttonGhost : null,
        variant === "danger" ? componentStyles.buttonDanger : null
      )}
      data-ui="button"
      data-size={size}
      data-variant={variant === "default" ? "secondary" : variant}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, "aria-label"> & {
  label: string;
};

export function IconButton({
  children,
  label,
  stylex: stylexStyle,
  size = "sm",
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      size={size}
      stylex={[
        stylexStyle,
        size === "md"
          ? componentStyles.iconButtonMd
          : componentStyles.iconButton,
      ]}
      title={props.title ?? label}
      {...props}
    >
      {children}
    </Button>
  );
}

export type SemanticTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type BadgeProps = PropsWithChildren<
  StyleXElementProps<"span"> & {
    stylex?: ConsoleStyle;
    tone?: SemanticTone;
  }
>;

export function Badge({
  children,
  stylex: stylexStyle,
  tone = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      {...stylex.props(
        stylexStyle,
        componentStyles.badge,
        tone === "info" ? componentStyles.badgeInfo : null,
        tone === "success" ? componentStyles.badgeSuccess : null,
        tone === "warning" ? componentStyles.badgeWarning : null,
        tone === "danger" ? componentStyles.badgeDanger : null
      )}
      data-ui="badge"
      data-tone={tone}
      {...props}
    >
      {children}
    </span>
  );
}

export type StatusMarkerProps = PropsWithChildren<
  StyleXElementProps<"span"> & {
    align?: "center" | "top";
    tone?: SemanticTone;
  }
>;

export type IconSlotSize = 12 | 16 | 20;

export type IconSlotProps = PropsWithChildren<
  StyleXElementProps<"span"> & {
    size?: IconSlotSize;
    stylex?: ConsoleStyle;
  }
>;

export function IconSlot({
  children,
  size = 16,
  stylex: stylexStyle,
  ...props
}: IconSlotProps) {
  return (
    <span
      {...stylex.props(
        stylexStyle,
        componentStyles.iconSlot,
        size === 12 ? componentStyles.iconSlot12 : null,
        size === 20 ? componentStyles.iconSlot20 : null
      )}
      data-ui="icon-slot"
      data-size={size}
      {...props}
    >
      {children}
    </span>
  );
}

export type InlineStatusProps = PropsWithChildren<
  StyleXElementProps<"span"> & {
    align?: "center" | "first-line" | "top";
    tone?: SemanticTone;
  }
>;

function InlineStatusMarkup({
  align = "center",
  children,
  tone = "neutral",
  ...props
}: InlineStatusProps) {
  return (
    <span
      {...stylex.props(
        componentStyles.inlineStatus,
        align !== "center" ? componentStyles.inlineStatusTop : null
      )}
      data-ui="inline-status"
      data-align={align}
      data-tone={tone}
      {...props}
    >
      <span
        {...stylex.props(
          componentStyles.inlineStatusDot,
          align !== "center" ? componentStyles.inlineStatusDotTop : null,
          tone === "info" ? componentStyles.inlineStatusDotInfo : null,
          tone === "success" ? componentStyles.inlineStatusDotSuccess : null,
          tone === "warning" ? componentStyles.inlineStatusDotWarning : null,
          tone === "danger" ? componentStyles.inlineStatusDotDanger : null
        )}
        data-ui="inline-status__dot"
        aria-hidden="true"
      />
      <span
        {...stylex.props(componentStyles.inlineStatusLabel)}
        data-ui="inline-status__label"
      >
        {children}
      </span>
    </span>
  );
}

export function InlineStatus({
  align = "center",
  children,
  tone = "neutral",
  ...props
}: InlineStatusProps) {
  return InlineStatusMarkup({
    align,
    children,
    tone,
    ...props,
  });
}

export function StatusMarker({
  align = "center",
  children,
  tone = "neutral",
  ...props
}: StatusMarkerProps) {
  return InlineStatusMarkup({
    align,
    children,
    tone,
    ...props,
  });
}

export type FilterControlProps = PropsWithChildren<
  StyleXButtonProps & { icon?: ReactNode }
>;

export function FilterControl({
  children,
  icon,
  type = "button",
  ...props
}: FilterControlProps) {
  return (
    <button
      {...stylex.props(componentStyles.filterControl)}
      data-ui="filter-control"
      type={type}
      {...props}
    >
      <span
        {...stylex.props(componentStyles.filterControlLabel)}
        data-ui="filter-control__label"
      >
        {children}
      </span>
      {icon ? <IconSlot size={12}>{icon}</IconSlot> : null}
    </button>
  );
}

export type FilterSelectProps = PropsWithChildren<
  StyleXSelectProps & {
    icon: ReactNode;
    stylex?: ConsoleStyle;
  }
>;

export function FilterSelect({
  children,
  icon,
  stylex: stylexStyle,
  ...props
}: FilterSelectProps) {
  return (
    <label
      {...stylex.props(stylexStyle, componentStyles.filterSelectRoot)}
      data-ui="filter-select"
    >
      <select
        {...stylex.props(componentStyles.filterSelect)}
        data-ui="filter-select__select"
        {...props}
      >
        {children}
      </select>
      <IconSlot
        aria-hidden="true"
        size={12}
        stylex={componentStyles.filterSelectIcon}
      >
        {icon}
      </IconSlot>
    </label>
  );
}

export type PaneHeaderProps = PropsWithChildren<
  StyleXElementProps<"header"> & {
    meta?: ReactNode;
    title?: ReactNode;
  }
>;

export function PaneHeader({
  children,
  meta,
  title,
  ...props
}: PaneHeaderProps) {
  return (
    <header
      {...stylex.props(componentStyles.paneHeader)}
      data-ui="pane-header"
      {...props}
    >
      <span
        {...stylex.props(componentStyles.paneHeaderTitle)}
        data-ui="pane-header__title"
      >
        {title ?? children}
      </span>
      {meta === undefined ? null : (
        <span
          {...stylex.props(componentStyles.paneHeaderMeta)}
          data-ui="pane-header__meta"
        >
          {meta}
        </span>
      )}
    </header>
  );
}

export type SurfaceGroupLabelProps = PropsWithChildren<
  StyleXElementProps<"div"> & {
    icon?: ReactNode;
    label: ReactNode;
    stylex?: ConsoleStyle;
  }
>;

export function SurfaceGroupLabel({
  children,
  icon,
  label,
  stylex: stylexStyle,
  ...props
}: SurfaceGroupLabelProps) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.surfaceGroupLabel)}
      data-ui="surface-group-label"
      {...props}
    >
      {icon ? <IconSlot size={16}>{icon}</IconSlot> : null}
      <span
        {...stylex.props(componentStyles.surfaceGroupLabelText)}
        data-ui="surface-group-label__text"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export type ConsoleTableVariant = "generic" | "provider" | "runtime";

export type TableHeaderProps = StyleXElementProps<"div"> & {
  columns?: readonly ReactNode[];
  variant?: ConsoleTableVariant;
};

const defaultTableColumns = ["Capability", "Kind", "Owner", "State"] as const;

export function TableHeader({
  children,
  columns = defaultTableColumns,
  variant = "generic",
  ...props
}: TableHeaderProps) {
  const labels = children ? [children] : columns;
  return (
    <div
      {...stylex.props(
        componentStyles.tableHeader,
        variant === "provider" ? componentStyles.tableHeaderProvider : null,
        variant === "runtime" ? componentStyles.tableHeaderRuntime : null
      )}
      data-ui="table-header"
      data-variant={variant}
      role="row"
      {...props}
    >
      {labels.map((column, index) => (
        <span
          {...stylex.props(
            componentStyles.tableHeaderCell,
            index === 0 ? componentStyles.tableHeaderCellFirst : null
          )}
          data-ui="table-header__cell"
          key={`table-header-${index}`}
        >
          {column}
        </span>
      ))}
    </div>
  );
}

export type DataRowProps = PropsWithChildren<
  StyleXElementProps<"div"> & {
    cells?: readonly ReactNode[];
    column2?: ReactNode;
    column3?: ReactNode;
    interactive?: boolean;
    primary?: ReactNode;
    secondary?: ReactNode;
    selected?: boolean;
    status?: ReactNode;
    variant?: ConsoleTableVariant;
    onActivate?: () => void;
  }
>;

export function DataRow({
  cells,
  children,
  column2,
  column3,
  interactive = false,
  onClick,
  onActivate,
  onKeyDown,
  primary,
  secondary,
  selected = false,
  status,
  variant = "generic",
  ...props
}: DataRowProps) {
  const trailingCells = cells ?? [column2, column3, status ?? children];
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      interactive &&
      onActivate &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      onActivate();
    }
    onKeyDown?.(event);
  };
  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (interactive && onActivate) {
      onActivate();
    }
    onClick?.(event);
  };

  return (
    <div
      {...stylex.props(
        componentStyles.dataRow,
        variant === "provider" ? componentStyles.dataRowProvider : null,
        variant === "runtime" ? componentStyles.dataRowRuntime : null,
        selected ? componentStyles.dataRowSelected : null,
        interactive
          ? (componentStyles.dataRowInteractive as ConsoleStyle)
          : null
      )}
      data-ui="data-row"
      aria-selected={selected}
      data-selected={selected ? "true" : "false"}
      data-variant={variant}
      role="row"
      tabIndex={interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      <span
        {...stylex.props(componentStyles.dataRowPrimary)}
        data-ui="data-row__primary"
      >
        <strong {...stylex.props(componentStyles.dataRowPrimaryText)}>
          {primary}
        </strong>
        {secondary === undefined ? null : (
          <small {...stylex.props(componentStyles.dataRowSecondaryText)}>
            {secondary}
          </small>
        )}
      </span>
      {trailingCells.map((cell, index) => (
        <span
          {...stylex.props(componentStyles.dataRowCell)}
          data-ui="data-row__cell"
          key={`data-row-${index}`}
        >
          {cell}
        </span>
      ))}
    </div>
  );
}

export type DataGridProps = PropsWithChildren<
  StyleXElementProps<"div"> & { stylex?: ConsoleStyle }
>;

/** Scrollable table surface used by official and third-party Module Surfaces. */
export function DataGrid({
  children,
  stylex: stylexStyle,
  ...props
}: DataGridProps) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.dataGrid)}
      data-ui="data-grid"
      {...props}
    >
      {children}
    </div>
  );
}

function PanelRoot({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"section"> & { stylex?: ConsoleStyle }
>) {
  return (
    <section
      {...stylex.props(stylexStyle, componentStyles.panel)}
      data-ui="panel"
      {...props}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"header"> & { stylex?: ConsoleStyle }
>) {
  return (
    <header
      {...stylex.props(stylexStyle, componentStyles.panelHeader)}
      data-ui="panel__header"
      {...props}
    >
      {children}
    </header>
  );
}

function PanelTitle({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"h2"> & { stylex?: ConsoleStyle }>) {
  return (
    <h2
      {...stylex.props(stylexStyle, componentStyles.panelTitle)}
      data-ui="panel__title"
      {...props}
    >
      {children}
    </h2>
  );
}

function PanelDescription({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"p"> & { stylex?: ConsoleStyle }>) {
  return (
    <p
      {...stylex.props(stylexStyle, componentStyles.panelDescription)}
      data-ui="panel__description"
      {...props}
    >
      {children}
    </p>
  );
}

function PanelContent({
  children,
  padding = "none",
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"div"> & {
    padding?: "none" | "sm" | "md";
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <div
      {...stylex.props(
        stylexStyle,
        padding === "sm" ? componentStyles.panelContentSm : null,
        padding === "md" ? componentStyles.panelContentMd : null
      )}
      data-ui="panel__content"
      data-padding={padding}
      {...props}
    >
      {children}
    </div>
  );
}

export const Panel = Object.assign(PanelRoot, {
  Content: PanelContent,
  Description: PanelDescription,
  Header: PanelHeader,
  Title: PanelTitle,
});

function SummaryStripRoot({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.summary)}
      data-ui="summary"
      {...props}
    >
      {children}
    </div>
  );
}

function SummaryStripItem({
  children,
  label,
  note,
  stylex: stylexStyle,
  tone = "neutral",
  value,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"div"> & {
    label: ReactNode;
    note?: ReactNode;
    stylex?: ConsoleStyle;
    tone?: SemanticTone;
    value: ReactNode;
  }
>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.summaryItem)}
      data-ui="summary__item"
      data-tone={tone}
      {...props}
    >
      <span
        {...stylex.props(componentStyles.summaryLabel)}
        data-ui="summary__label"
      >
        {label}
      </span>
      <strong
        {...stylex.props(
          componentStyles.summaryValue,
          tone === "warning" ? componentStyles.summaryValueWarning : null,
          tone === "danger" ? componentStyles.summaryValueDanger : null,
          tone === "success" ? componentStyles.summaryValueSuccess : null
        )}
        data-ui="summary__value"
      >
        {value}
      </strong>
      {note ? (
        <span
          {...stylex.props(componentStyles.summaryNote)}
          data-ui="summary__note"
        >
          {note}
        </span>
      ) : null}
      {children}
    </div>
  );
}

export const SummaryStrip = Object.assign(SummaryStripRoot, {
  Item: SummaryStripItem,
});

function SplitViewRoot({
  children,
  inset = "default",
  inspectorWidth,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"div"> & {
    inset?: "default" | "none";
    inspectorWidth?: number;
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <div
      {...stylex.props(
        stylexStyle,
        componentStyles.splitView,
        inset === "none" ? componentStyles.splitViewNone : null,
        inspectorWidth === undefined
          ? null
          : componentStyles.splitViewDynamic(inspectorWidth)
      )}
      data-ui="split-view"
      data-inset={inset}
      {...props}
    >
      {children}
    </div>
  );
}

function SplitViewMain({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"section"> & { stylex?: ConsoleStyle }
>) {
  return (
    <section
      {...stylex.props(
        stylexStyle,
        componentStyles.splitViewPane,
        componentStyles.splitViewMain
      )}
      data-ui="split-view__main"
      {...props}
    >
      {children}
    </section>
  );
}

function SplitViewInspector({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"aside"> & { stylex?: ConsoleStyle }>) {
  return (
    <aside
      {...stylex.props(
        stylexStyle,
        componentStyles.splitViewPane,
        componentStyles.splitViewInspector
      )}
      data-ui="split-view__inspector"
      {...props}
    >
      {children}
    </aside>
  );
}

export const SplitView = Object.assign(SplitViewRoot, {
  Inspector: SplitViewInspector,
  Main: SplitViewMain,
});

export type InspectorProps = PropsWithChildren<
  StyleXElementProps<"div"> & {
    headerAction?: ReactNode;
    status?: ReactNode;
    subtitle?: ReactNode;
    title?: ReactNode;
  }
>;

function InspectorRoot({
  children,
  headerAction,
  status,
  subtitle,
  title,
  stylex: stylexStyle,
  ...props
}: InspectorProps & { stylex?: ConsoleStyle }) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.inspector)}
      data-ui="inspector"
      {...props}
    >
      {title === undefined &&
      subtitle === undefined &&
      !status &&
      !headerAction ? null : (
        <header
          {...stylex.props(
            componentStyles.inspectorHeader,
            headerAction ? componentStyles.inspectorHeaderWithAction : null
          )}
          data-ui="inspector__header"
          data-has-action={headerAction ? "true" : undefined}
        >
          <div
            {...stylex.props(componentStyles.inspectorHeaderContent)}
            data-ui="inspector__header-content"
          >
            {title === undefined ? null : (
              <h2
                {...stylex.props(componentStyles.inspectorTitle)}
                data-ui="inspector__title"
              >
                {title}
              </h2>
            )}
            {subtitle === undefined ? null : (
              <p
                {...stylex.props(componentStyles.inspectorSubtitle)}
                data-ui="inspector__subtitle"
              >
                {subtitle}
              </p>
            )}
            {status ? (
              <div
                {...stylex.props(componentStyles.inspectorStatus)}
                data-ui="inspector__status"
              >
                {status}
              </div>
            ) : null}
          </div>
          {headerAction ? (
            <div
              {...stylex.props(componentStyles.inspectorHeaderAction)}
              data-ui="inspector__header-action"
            >
              {headerAction}
            </div>
          ) : null}
        </header>
      )}
      {children}
    </div>
  );
}

function InspectorSection({
  children,
  title,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"section"> & {
    title?: ReactNode;
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <section
      {...stylex.props(stylexStyle, componentStyles.inspectorSection)}
      data-ui="inspector__section"
      {...props}
    >
      {title === undefined ? null : (
        <h3
          {...stylex.props(componentStyles.inspectorSectionTitle)}
          data-ui="inspector__section-title"
        >
          {title}
        </h3>
      )}
      <div
        {...stylex.props(componentStyles.inspectorSectionBody)}
        data-ui="inspector__section-body"
      >
        {children}
      </div>
    </section>
  );
}

function InspectorActions({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.inspectorActions)}
      data-ui="inspector__actions"
      {...props}
    >
      {children}
    </div>
  );
}

export const Inspector = Object.assign(InspectorRoot, {
  Actions: InspectorActions,
  Section: InspectorSection,
});

function SectionRoot({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"section"> & { stylex?: ConsoleStyle }
>) {
  return (
    <section
      {...stylex.props(stylexStyle, componentStyles.section)}
      data-ui="section"
      {...props}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"header"> & { stylex?: ConsoleStyle }
>) {
  return (
    <header
      {...stylex.props(stylexStyle, componentStyles.sectionHeader)}
      data-ui="section__header"
      {...props}
    >
      {children}
    </header>
  );
}

function SectionTitle({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"h2"> & { stylex?: ConsoleStyle }>) {
  return (
    <h2
      {...stylex.props(stylexStyle, componentStyles.sectionTitle)}
      data-ui="section__title"
      {...props}
    >
      {children}
    </h2>
  );
}

function SectionMeta({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"span"> & { stylex?: ConsoleStyle }>) {
  return (
    <span
      {...stylex.props(stylexStyle, componentStyles.sectionMeta)}
      data-ui="section__meta"
      {...props}
    >
      {children}
    </span>
  );
}

function SectionBody({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.sectionBody)}
      data-ui="section__body"
      {...props}
    >
      {children}
    </div>
  );
}

export const Section = Object.assign(SectionRoot, {
  Body: SectionBody,
  Header: SectionHeader,
  Meta: SectionMeta,
  Title: SectionTitle,
});

function KeyValueListRoot({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"dl"> & { stylex?: ConsoleStyle }>) {
  return (
    <dl {...stylex.props(stylexStyle)} data-ui="key-values" {...props}>
      {children}
    </dl>
  );
}

function KeyValueListRow({
  label,
  value,
  stylex: stylexStyle,
  ...props
}: StyleXElementProps<"div"> & {
  label: ReactNode;
  value: ReactNode;
  stylex?: ConsoleStyle;
}) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.keyValuesRow)}
      data-ui="key-values__row"
      {...props}
    >
      <dt
        {...stylex.props(componentStyles.keyValuesLabel)}
        data-ui="key-values__label"
      >
        {label}
      </dt>
      <dd
        {...stylex.props(componentStyles.keyValuesValue)}
        data-ui="key-values__value"
      >
        {value}
      </dd>
    </div>
  );
}

export const KeyValueList = Object.assign(KeyValueListRoot, {
  Row: KeyValueListRow,
});

export function StateView({
  action,
  description,
  icon,
  stylex: stylexStyle,
  title,
  ...props
}: StyleXElementProps<"div"> & {
  action?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  stylex?: ConsoleStyle;
}) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.state)}
      data-ui="state"
      {...props}
    >
      {icon ? (
        <span
          {...stylex.props(componentStyles.stateIcon)}
          data-ui="state__icon"
        >
          {icon}
        </span>
      ) : null}
      <strong
        {...stylex.props(componentStyles.stateTitle)}
        data-ui="state__title"
      >
        {title}
      </strong>
      <p
        {...stylex.props(componentStyles.stateDescription)}
        data-ui="state__description"
      >
        {description}
      </p>
      {action ? (
        <div
          {...stylex.props(componentStyles.stateAction)}
          data-ui="state__action"
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}

type TabsDensity = "default" | "page" | "inspector";

const TabsContext = createContext<{
  density: TabsDensity;
  leadingIcon: boolean;
}>({ density: "default", leadingIcon: false });

function TabsRoot({
  children,
  density = "default",
  inset = "default",
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"div"> & {
    density?: "default" | "page" | "inspector";
    inset?: "default" | "none" | "sm";
    stylex?: ConsoleStyle;
  }
>) {
  const context = { density, leadingIcon: false } as const;
  return (
    <TabsContext.Provider value={context}>
      <div
        {...stylex.props(stylexStyle)}
        data-ui="tabs"
        data-density={density}
        data-inset={inset}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({
  children,
  inset,
  leadingIcon,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"div"> & {
    inset?: "default" | "none" | "sm";
    leadingIcon?: boolean;
    stylex?: ConsoleStyle;
  }
>) {
  const context = useContext(TabsContext);
  return (
    <TabsContext.Provider
      value={{ ...context, leadingIcon: Boolean(leadingIcon) }}
    >
      <div
        {...stylex.props(
          stylexStyle,
          componentStyles.tabsList,
          context.density === "page" ? componentStyles.tabsListPage : null,
          context.density === "inspector"
            ? componentStyles.tabsListInspector
            : null,
          inset === "sm" ? componentStyles.tabsListInsetSm : null
        )}
        data-ui="tabs__list"
        data-inset={inset}
        data-leading={leadingIcon ? "icon" : undefined}
        role="tablist"
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsTab({
  children,
  onKeyDown,
  selected,
  stylex: stylexStyle,
  type = "button",
  ...props
}: PropsWithChildren<
  StyleXButtonProps & {
    selected: boolean;
    stylex?: ConsoleStyle;
  }
>) {
  const { density, leadingIcon } = useContext(TabsContext);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }

    const tabs = [
      ...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]'
      ) ?? []),
    ];
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex === -1 || tabs.length < 2) {
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return (
    <button
      aria-selected={selected}
      {...stylex.props(
        stylexStyle,
        componentStyles.tabsTab,
        density !== "default" ? componentStyles.tabsTabDense : null,
        selected ? componentStyles.tabsTabSelected : null,
        selected && density !== "default"
          ? componentStyles.tabsTabSelectedDense
          : null,
        selected && leadingIcon
          ? componentStyles.tabsTabSelectedLeadingIcon
          : null
      )}
      data-ui="tabs__tab"
      role="tab"
      type={type}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </button>
  );
}

function TabsPanel({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.tabsPanel)}
      data-ui="tabs__panel"
      role="tabpanel"
      {...props}
    >
      {children}
    </div>
  );
}

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Panel: TabsPanel,
  Tab: TabsTab,
});

function SettingsGroupRoot({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"section"> & { stylex?: ConsoleStyle }
>) {
  return (
    <section
      {...stylex.props(stylexStyle, componentStyles.settingsGroup)}
      data-ui="settings-group"
      {...props}
    >
      {children}
    </section>
  );
}

function SettingsGroupHeader({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"header"> & { stylex?: ConsoleStyle }
>) {
  return (
    <header
      {...stylex.props(stylexStyle, componentStyles.settingsGroupHeader)}
      data-ui="settings-group__header"
      {...props}
    >
      {children}
    </header>
  );
}

function SettingsGroupTitle({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"h2"> & { stylex?: ConsoleStyle }>) {
  return (
    <h2
      {...stylex.props(stylexStyle, componentStyles.settingsGroupTitle)}
      data-ui="settings-group__title"
      {...props}
    >
      {children}
    </h2>
  );
}

function SettingsGroupDescription({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"p"> & { stylex?: ConsoleStyle }>) {
  return (
    <p
      {...stylex.props(stylexStyle, componentStyles.settingsGroupDescription)}
      data-ui="settings-group__description"
      {...props}
    >
      {children}
    </p>
  );
}

export const SettingsGroup = Object.assign(SettingsGroupRoot, {
  Description: SettingsGroupDescription,
  Header: SettingsGroupHeader,
  Title: SettingsGroupTitle,
});

export function SettingsRow({
  children,
  description,
  label,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  StyleXElementProps<"div"> & {
    description?: ReactNode;
    label: ReactNode;
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.settingsRow)}
      data-ui="settings-row"
      {...props}
    >
      <div
        {...stylex.props(componentStyles.settingsRowCopy)}
        data-ui="settings-row__copy"
      >
        <div
          {...stylex.props(componentStyles.settingsRowLabel)}
          data-ui="settings-row__label"
        >
          {label}
        </div>
        {description ? (
          <div
            {...stylex.props(componentStyles.settingsRowDescription)}
            data-ui="settings-row__description"
          >
            {description}
          </div>
        ) : null}
      </div>
      <div
        {...stylex.props(componentStyles.settingsRowControl)}
        data-ui="settings-row__control"
      >
        {children}
      </div>
    </div>
  );
}

function FieldRoot({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.field)}
      data-ui="field"
      {...props}
    >
      {children}
    </div>
  );
}

function FieldLabel({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"label"> & { stylex?: ConsoleStyle }>) {
  return (
    <label
      {...stylex.props(stylexStyle, componentStyles.fieldLabel)}
      data-ui="field__label"
      {...props}
    >
      {children}
    </label>
  );
}

function FieldHint({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"p"> & { stylex?: ConsoleStyle }>) {
  return (
    <p
      {...stylex.props(stylexStyle, componentStyles.fieldHint)}
      data-ui="field__hint"
      {...props}
    >
      {children}
    </p>
  );
}

function FieldError({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"p"> & { stylex?: ConsoleStyle }>) {
  return (
    <p
      {...stylex.props(stylexStyle, componentStyles.fieldError)}
      data-ui="field__error"
      role="alert"
      {...props}
    >
      {children}
    </p>
  );
}

export const Field = Object.assign(FieldRoot, {
  Error: FieldError,
  Hint: FieldHint,
  Label: FieldLabel,
});

export function Input({
  stylex: stylexStyle,
  ...props
}: StyleXElementProps<"input"> & { stylex?: ConsoleStyle }) {
  return (
    <input
      {...stylex.props(stylexStyle, componentStyles.input)}
      data-ui="input"
      {...props}
    />
  );
}

export function Select({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXSelectProps & { stylex?: ConsoleStyle }>) {
  return (
    <select
      {...stylex.props(stylexStyle, componentStyles.input)}
      data-ui="select"
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  stylex: stylexStyle,
  ...props
}: StyleXTextareaProps & { stylex?: ConsoleStyle }) {
  return (
    <textarea
      {...stylex.props(
        stylexStyle,
        componentStyles.input,
        componentStyles.textarea
      )}
      data-ui="textarea"
      {...props}
    />
  );
}

function EmptyStateRoot({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"div"> & { stylex?: ConsoleStyle }>) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.emptyState)}
      data-ui="empty-state"
      {...props}
    >
      {children}
    </div>
  );
}

function EmptyStateIcon({
  children,
  stylex: stylexStyle,
}: {
  children: ReactNode;
  stylex?: ConsoleStyle;
}) {
  return (
    <div
      {...stylex.props(stylexStyle, componentStyles.emptyStateIcon)}
      data-ui="empty-state__icon"
    >
      {children}
    </div>
  );
}

function EmptyStateTitle({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"h2"> & { stylex?: ConsoleStyle }>) {
  return (
    <h2
      {...stylex.props(stylexStyle, componentStyles.emptyStateTitle)}
      data-ui="empty-state__title"
      {...props}
    >
      {children}
    </h2>
  );
}

function EmptyStateDescription({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"p"> & { stylex?: ConsoleStyle }>) {
  return (
    <p
      {...stylex.props(stylexStyle, componentStyles.emptyStateDescription)}
      data-ui="empty-state__description"
      {...props}
    >
      {children}
    </p>
  );
}

export const EmptyState = Object.assign(EmptyStateRoot, {
  Description: EmptyStateDescription,
  Icon: EmptyStateIcon,
  Title: EmptyStateTitle,
});

function DataTableRoot({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"table"> & { stylex?: ConsoleStyle }>) {
  return (
    <div {...stylex.props(componentStyles.tableWrap)} data-ui="table-wrap">
      <table
        {...stylex.props(stylexStyle, componentStyles.table)}
        data-ui="table"
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

function DataTableHead({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"thead"> & { stylex?: ConsoleStyle }>) {
  return (
    <thead
      {...stylex.props(stylexStyle, componentStyles.tableHead)}
      data-ui="table__head"
      {...props}
    >
      {children}
    </thead>
  );
}

function DataTableBody({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"tbody"> & { stylex?: ConsoleStyle }>) {
  return (
    <tbody {...stylex.props(stylexStyle)} data-ui="table__body" {...props}>
      {children}
    </tbody>
  );
}

function DataTableRow({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"tr"> & { stylex?: ConsoleStyle }>) {
  return (
    <tr
      {...stylex.props(stylexStyle, componentStyles.tableRow)}
      data-ui="table__row"
      {...props}
    >
      {children}
    </tr>
  );
}

function DataTableHeader({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"th"> & { stylex?: ConsoleStyle }>) {
  return (
    <th
      {...stylex.props(stylexStyle, componentStyles.dataTableHeaderCell)}
      data-ui="table__header"
      {...props}
    >
      {children}
    </th>
  );
}

function DataTableCell({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<StyleXElementProps<"td"> & { stylex?: ConsoleStyle }>) {
  return (
    <td
      {...stylex.props(stylexStyle, componentStyles.dataTableCell)}
      data-ui="table__cell"
      {...props}
    >
      {children}
    </td>
  );
}

export const DataTable = Object.assign(DataTableRoot, {
  Body: DataTableBody,
  Cell: DataTableCell,
  Head: DataTableHead,
  Header: DataTableHeader,
  Row: DataTableRow,
});

export interface ConsoleUiComponents {
  Badge: typeof Badge;
  Button: typeof Button;
  ConsolePage: typeof ConsolePage;
  DataRow: typeof DataRow;
  DataTable: typeof DataTable;
  EmptyState: typeof EmptyState;
  Field: typeof Field;
  FilterControl: typeof FilterControl;
  FilterSelect: typeof FilterSelect;
  IconButton: typeof IconButton;
  IconSlot: typeof IconSlot;
  Input: typeof Input;
  InlineStatus: typeof InlineStatus;
  Inspector: typeof Inspector;
  KeyValueList: typeof KeyValueList;
  Panel: typeof Panel;
  PaneHeader: typeof PaneHeader;
  Section: typeof Section;
  Select: typeof Select;
  SettingsGroup: typeof SettingsGroup;
  SettingsRow: typeof SettingsRow;
  SurfaceGroupLabel: typeof SurfaceGroupLabel;
  StatusMarker: typeof StatusMarker;
  StateView: typeof StateView;
  SummaryStrip: typeof SummaryStrip;
  SplitView: typeof SplitView;
  TableHeader: typeof TableHeader;
  Tabs: typeof Tabs;
  Textarea: typeof Textarea;
  SurfaceRoot: typeof SurfaceRoot;
}

export const consoleUi: ConsoleUiComponents = {
  Badge,
  Button,
  ConsolePage,
  DataRow,
  DataTable,
  EmptyState,
  Field,
  FilterControl,
  FilterSelect,
  IconButton,
  IconSlot,
  InlineStatus,
  Input,
  Inspector,
  KeyValueList,
  PaneHeader,
  Panel,
  Section,
  Select,
  SettingsGroup,
  SettingsRow,
  SplitView,
  StateView,
  StatusMarker,
  SummaryStrip,
  SurfaceGroupLabel,
  TableHeader,
  Tabs,
  Textarea,
  SurfaceRoot,
};
