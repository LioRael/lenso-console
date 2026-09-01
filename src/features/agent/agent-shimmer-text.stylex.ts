import * as stylex from "@stylexjs/stylex";

const shimmer = stylex.keyframes({
  from: { backgroundPosition: "100% 0" },
  to: { backgroundPosition: "0 0" },
});

export const agentShimmerTextStyles = stylex.create({
  active: {
    color: "var(--color-content-tertiary)",
    display: "inline-block",
    position: "relative",
  },
  highlight: {
    animationDuration: "2000ms",
    animationIterationCount: "infinite",
    animationName: shimmer,
    animationTimingFunction: "linear",
    backgroundClip: "text",
    backgroundImage:
      "linear-gradient(90deg, transparent 0%, transparent 40%, var(--color-content-primary) 50%, transparent 60%, transparent 100%)",
    backgroundPosition: "100% 0",
    backgroundRepeat: "no-repeat",
    backgroundSize: "400% 100%",
    color: "transparent",
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
  },
});
