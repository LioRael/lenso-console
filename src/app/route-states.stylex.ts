import * as stylex from "@stylexjs/stylex";

export const routeStateStyles = stylex.create({
  description: {
    fontSize: "13px",
    margin: 0,
  },
  icon: {
    display: "inline-flex",
  },
  root: {
    alignContent: "center",
    color: "var(--color-content-tertiary)",
    display: "grid",
    gap: "10px",
    justifyItems: "start",
    minHeight: "100%",
    padding: "32px",
  },
  title: {
    color: "var(--color-content-primary)",
    fontSize: "15px",
    fontWeight: 500,
    margin: 0,
  },
});
