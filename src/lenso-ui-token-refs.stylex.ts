import * as stylex from "@stylexjs/stylex";

/** Compile-time references to the public CSS contract loaded from @lenso/tokens/styles.css. */
export const lensoUiTokens = stylex.defineConsts({
  colorBorderTertiary: "var(--color-border-tertiary)",
  colorContentInverse: "var(--color-content-inverse)",
  colorContentPrimary: "var(--color-content-primary)",
  colorContentSecondary: "var(--color-content-secondary)",
  colorContentTertiary: "var(--color-content-tertiary)",
  colorFocusRing: "var(--color-focus-ring)",
  colorSurfaceCanvas: "var(--color-surface-canvas)",
  colorSurfaceInteractiveHover: "var(--color-surface-interactive-hover)",
  colorSurfaceSelected: "var(--color-surface-selected)",
  colorSurfaceSubtle: "var(--color-surface-subtle)",
  fontSans: "var(--font-sans)",
  radiusControl: "var(--radius-control)",
  sizeSidebar: "var(--size-sidebar)",
  space2: "var(--space-2)",
  space3: "var(--space-3)",
  space4: "var(--space-4)",
  space6: "var(--space-6)",
});
