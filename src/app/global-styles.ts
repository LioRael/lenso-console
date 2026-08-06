import { tokens } from "@lenso/console-tokens/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

export const globalStyles = stylex.create({
  body: {
    backgroundColor: tokens.canvas,
    color: tokens.foreground,
    margin: 0,
    minHeight: "100vh",
    minWidth: 320,
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },
  document: {
    backgroundColor: tokens.canvas,
    boxSizing: "border-box",
    fontFeatureSettings: '"liga" 1, "calt" 1',
    minHeight: "100%",
  },
  root: {
    boxSizing: "border-box",
  },
});

export function applyGlobalStyles() {
  const { body, documentElement } = globalThis.document;
  const documentProps = stylex.props(globalStyles.document);
  const bodyProps = stylex.props(globalStyles.body);
  const rootProps = stylex.props(globalStyles.root);

  documentElement.className = [
    documentElement.className,
    documentProps.className,
  ]
    .filter(Boolean)
    .join(" ");
  body.className = [body.className, bodyProps.className]
    .filter(Boolean)
    .join(" ");
  const root = globalThis.document.getElementById("root");
  if (root) {
    root.className = [root.className, rootProps.className]
      .filter(Boolean)
      .join(" ");
  }
}
