import * as stylex from "@stylexjs/stylex";

export const assistantSettingsStyles = stylex.create({
  providerRow: {
    borderBottomWidth: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) minmax(0, 240px)",
      "@media (max-width: 520px)": "minmax(0, 1fr)",
    },
  },
  providerControl: { minWidth: 0, width: "100%" },
  providerTrigger: { width: "100%", minWidth: 0 },
  keyBody: { display: "grid", gap: 12, padding: 16 },
});
