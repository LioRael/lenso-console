import * as stylex from "@stylexjs/stylex";

export const sessionStyles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: "var(--color-surface-primary)",
    color: "var(--color-content-primary)",
    display: "flex",
    justifyContent: "center",
    minHeight: "100dvh",
    padding: "24px",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    width: "320px",
    maxWidth: "100%",
  },
  brand: { fontSize: "14px", fontWeight: 600 },
  title: {
    fontSize: "22px",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    margin: 0,
  },
  muted: {
    color: "var(--color-content-secondary)",
    fontSize: "13px",
    lineHeight: 1.5,
    margin: 0,
  },
  methods: { display: "flex", flexDirection: "column", gap: "12px" },
  label: { fontSize: "13px", marginBottom: "-6px" },
});
