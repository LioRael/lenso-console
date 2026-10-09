import * as stylex from "@stylexjs/stylex";

export const layoutStyles = stylex.create({
  root: {
    position: "relative",
    isolation: "isolate",
  },
  content: {
    position: "relative",
    zIndex: 0,
    height: "100%",
  },
  foreground: {
    position: "fixed",
    inset: 0,
    zIndex: 20,
    pointerEvents: "none",
  },
  corner: {
    position: "absolute",
    pointerEvents: "auto",
  },
  floating: {
    display: "contents",
    pointerEvents: "auto",
  },
});

export const cornerStyles = stylex.create({
  topLeft: { top: 16, left: 20 },
  topRight: { top: 16, right: 20 },
  bottomLeft: { bottom: 24, left: 28 },
  bottomRight: { bottom: 24, right: 28 },
});

export const edgeStyles = stylex.create({
  root: {
    position: "fixed",
    top: 0,
    insetInline: 0,
    zIndex: 10,
    pointerEvents: "none",
    userSelect: "none",
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      backgroundImage:
        "linear-gradient(to bottom, var(--background) 0%, transparent 90%)",
    },
  },
  parameters: (height: number, maskOpacity: number) => ({
    height,
    "::after": { opacity: maskOpacity },
  }),
  layer: {
    display: "none",
    position: "absolute",
    inset: 0,
  },
  supportedBlur: {
    display: {
      default: "none",
      "@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) and ((mask-image: linear-gradient(black, transparent)) or (-webkit-mask-image: linear-gradient(black, transparent)))":
        {
          default: "block",
          "@media (prefers-reduced-transparency: reduce)": "none",
        },
    },
  },
  strong: (radius: number) => ({
    backdropFilter: `blur(${radius}px)`,
    WebkitBackdropFilter: `blur(${radius}px)`,
    maskImage:
      "linear-gradient(to bottom, black 0%, rgb(0 0 0 / 65%) 20%, rgb(0 0 0 / 15%) 40%, transparent 65%)",
    WebkitMaskImage:
      "linear-gradient(to bottom, black 0%, rgb(0 0 0 / 65%) 20%, rgb(0 0 0 / 15%) 40%, transparent 65%)",
  }),
  soft: (radius: number) => ({
    backdropFilter: `blur(${radius}px)`,
    WebkitBackdropFilter: `blur(${radius}px)`,
    maskImage:
      "linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 55%) 25%, rgb(0 0 0 / 80%) 50%, rgb(0 0 0 / 30%) 70%, transparent 90%)",
    WebkitMaskImage:
      "linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 55%) 25%, rgb(0 0 0 / 80%) 50%, rgb(0 0 0 / 30%) 70%, transparent 90%)",
  }),
});
