/* eslint-disable sort-keys */

import * as stylex from "@stylexjs/stylex";

/**
 * Package-local StyleX token bridge.
 *
 * StyleX hashes a variable import by the package/file that defines it. The UI
 * package is distributed independently from the Host, so importing the token
 * source through the workspace package can leave declarations pointing at a
 * different hash than the stylesheet that defines them. Keeping this bridge
 * in the UI package makes its public CSS self-contained while the values still
 * resolve through the Host-owned, themeable token names.
 */
export const tokens = stylex.defineVars({
  canvas: "var(--lenso-token-canvas, #000000)",
  window: "var(--lenso-token-window, #000000)",
  panel: "var(--lenso-token-panel, #000000)",
  panelHeader: "var(--lenso-token-panelHeader, #0a0a0a)",
  rowHover: "var(--lenso-token-rowHover, #111111)",
  rowSelected: "var(--lenso-token-rowSelected, #1f1f1f)",
  control: "var(--lenso-token-control, #000000)",
  controlHover: "var(--lenso-token-controlHover, #111111)",
  controlActive: "var(--lenso-token-controlActive, #1a1a1a)",
  overlay: "var(--lenso-token-overlay, #000000)",
  sidebar: "var(--lenso-token-sidebar, #0a0a0a)",
  foreground: "var(--lenso-token-foreground, #ffffff)",
  foregroundSecondary: "var(--lenso-token-foregroundSecondary, #d4d4d4)",
  foregroundTertiary: "var(--lenso-token-foregroundTertiary, #737373)",
  foregroundQuaternary: "var(--lenso-token-foregroundQuaternary, #525252)",
  line: "var(--lenso-token-line, #333333)",
  lineSubtle: "var(--lenso-token-lineSubtle, #1f1f1f)",
  lineStrong: "var(--lenso-token-lineStrong, #444444)",
  accent: "var(--lenso-token-accent, #ffffff)",
  accentHover: "var(--lenso-token-accentHover, #ffffff)",
  accentForeground: "var(--lenso-token-accentForeground, #000000)",
  success: "var(--lenso-token-success, #00a63e)",
  warning: "var(--lenso-token-warning, #f5a524)",
  error: "var(--lenso-token-error, #e5484d)",
  info: "var(--lenso-token-info, #0070f3)",
  toneMutedBg: "var(--lenso-token-toneMutedBg, rgba(255, 255, 255, 0.06))",
  toneMutedBorder:
    "var(--lenso-token-toneMutedBorder, rgba(255, 255, 255, 0.14))",
  toneMutedForeground: "var(--lenso-token-toneMutedForeground, #d4d4d4)",
  toneInfoBg: "var(--lenso-token-toneInfoBg, rgba(0, 112, 243, 0.12))",
  toneInfoBorder: "var(--lenso-token-toneInfoBorder, rgba(0, 112, 243, 0.3))",
  toneInfoForeground: "var(--lenso-token-toneInfoForeground, #d4d4d4)",
  toneSuccessBg: "var(--lenso-token-toneSuccessBg, rgba(0, 166, 62, 0.12))",
  toneSuccessBorder:
    "var(--lenso-token-toneSuccessBorder, rgba(0, 166, 62, 0.28))",
  toneSuccessForeground: "var(--lenso-token-toneSuccessForeground, #00a63e)",
  toneWarningBg: "var(--lenso-token-toneWarningBg, rgba(245, 165, 36, 0.12))",
  toneWarningBorder:
    "var(--lenso-token-toneWarningBorder, rgba(245, 165, 36, 0.3))",
  toneWarningForeground: "var(--lenso-token-toneWarningForeground, #f5a524)",
  toneErrorBg: "var(--lenso-token-toneErrorBg, rgba(229, 72, 77, 0.13))",
  toneErrorBorder:
    "var(--lenso-token-toneErrorBorder, rgba(229, 72, 77, 0.32))",
  toneErrorForeground: "var(--lenso-token-toneErrorForeground, #ff8589)",
  focusRing: "var(--lenso-token-focusRing, rgba(255, 255, 255, 0.72))",
  focusRingMuted:
    "var(--lenso-token-focusRingMuted, rgba(255, 255, 255, 0.22))",
  radiusControl: "var(--lenso-token-radiusControl, 6px)",
  radiusPanel: "var(--lenso-token-radiusPanel, 6px)",
  radiusPopover: "var(--lenso-token-radiusPopover, 8px)",
  radiusPill: "var(--lenso-token-radiusPill, 999px)",
  controlHeightSm: "var(--lenso-token-controlHeightSm, 28px)",
  controlHeightMd: "var(--lenso-token-controlHeightMd, 32px)",
  space1: "var(--lenso-token-space1, 4px)",
  space1_5: "var(--lenso-token-space1_5, 6px)",
  space2: "var(--lenso-token-space2, 8px)",
  space3: "var(--lenso-token-space3, 12px)",
  space4: "var(--lenso-token-space4, 16px)",
  space5: "var(--lenso-token-space5, 20px)",
  space6: "var(--lenso-token-space6, 24px)",
  space8: "var(--lenso-token-space8, 32px)",
  fontUi: 'var(--lenso-token-fontUi, "IBM Plex Sans", sans-serif)',
  fontCode: 'var(--lenso-token-fontCode, "Roboto Mono", monospace)',
  contentGutter: "var(--lenso-token-contentGutter, 20px)",
  pageGutter: "var(--lenso-token-pageGutter, 40px)",
  pageMaxWidth: "var(--lenso-token-pageMaxWidth, 1216px)",
  sidebarWidth: "var(--lenso-token-sidebarWidth, 224px)",
  sidebarCollapsedWidth: "var(--lenso-token-sidebarCollapsedWidth, 64px)",
  toolbarHeight: "var(--lenso-token-toolbarHeight, 48px)",
  inspectorWidth: "var(--lenso-token-inspectorWidth, 376px)",
  tableRowHeight: "var(--lenso-token-tableRowHeight, 64px)",
  tableHeaderHeight: "var(--lenso-token-tableHeaderHeight, 38px)",
  paneHeaderHeight: "var(--lenso-token-paneHeaderHeight, 50px)",
  tabHeight: "var(--lenso-token-tabHeight, 33px)",
  shadowControl: "var(--lenso-token-shadowControl, none)",
  shadowPanel: "var(--lenso-token-shadowPanel, none)",
  shadowOverlay:
    "var(--lenso-token-shadowOverlay, 0 24px 70px -42px rgba(0, 0, 0, 0.88), 0 1px 0 rgba(255, 255, 255, 0.05))",
  sidebarTrack: "var(--lenso-token-sidebarWidth, 224px) minmax(0, 1fr)",
  sidebarCollapsedTrack:
    "var(--lenso-token-sidebarCollapsedWidth, 64px) minmax(0, 1fr)",
});
