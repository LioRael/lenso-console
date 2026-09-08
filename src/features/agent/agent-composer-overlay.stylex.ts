import * as stylex from "@stylexjs/stylex";

// Composer overlays must escape scrolling toolbars and sit above the mini dialog (90).
export const composerOverlayStyles = stylex.create({
  positioner: { zIndex: 110 },
});
