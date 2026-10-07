import * as stylex from "@stylexjs/stylex";

/** Compile-time references to the public CSS contract loaded from @lenso/tokens/styles.css. */
export const lensoUiTokens = stylex.defineConsts({
  colorBorderTertiary: "var(--separator)",
  colorContentInverse: "var(--accent-foreground)",
  colorContentPrimary: "var(--foreground)",
  colorContentSecondary: "var(--muted)",
  colorContentTertiary: "var(--muted)",
  colorFocusRing: "var(--focus)",
  colorSurfaceCanvas: "var(--background)",
  colorSurfaceInteractiveHover: "var(--default-hover)",
  colorSurfaceSelected: "var(--accent-soft)",
  colorSurfaceSubtle: "var(--surface-secondary)",
  fontSans: "var(--font-sans)",
  radiusControl: "var(--field-radius)",
  sizeSidebar: "var(--console-sidebar-width)",
  space2: "calc(var(--spacing) * 2)",
  space3: "calc(var(--spacing) * 3)",
  space4: "calc(var(--spacing) * 4)",
  space6: "calc(var(--spacing) * 6)",
});
