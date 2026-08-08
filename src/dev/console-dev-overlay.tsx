import * as stylex from "@stylexjs/stylex";

import type { ConsoleDevConfig } from "./console-dev-config";

const localStyles = stylex.create({
  utilityFixed: {
    position: "fixed",
  },
  utilityRight3: {
    right: "calc(0.25rem * 3)",
  },
  utilityBottom3: {
    bottom: "calc(0.25rem * 3)",
  },
  utilityZ50: {
    zIndex: "50",
  },
  utilityRoundedVarRadiusPanel: {
    borderRadius: "var(--radius-panel)",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgPanel: {
    backgroundColor: "var(--bg-panel)",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPy2: {
    paddingBlock: "calc(0.25rem * 2)",
  },
  utilityTextXs: {
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "var(--text-xs--line-height, 1rem)",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityShadowElevationPanel: {
    boxShadow: "var(--elevation-panel)",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
});

export function ConsoleDevOverlay({ config }: { config: ConsoleDevConfig }) {
  if (!config.enabled || (!config.diagnosticsUrl && !config.targetLabel)) {
    return null;
  }

  return (
    <aside
      {...stylex.props([
        localStyles.utilityFixed,
        localStyles.utilityRight3,
        localStyles.utilityBottom3,
        localStyles.utilityZ50,
        localStyles.utilityRoundedVarRadiusPanel,
        localStyles.utilityBorder,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgPanel,
        localStyles.utilityPx3,
        localStyles.utilityPy2,
        localStyles.utilityTextXs,
        localStyles.utilityTextFgSecondary,
        localStyles.utilityShadowElevationPanel,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFontSemibold,
          localStyles.utilityTextFgPrimary,
        ])}
      >
        Console Dev
      </div>
      <div>Mode: {config.mode}</div>
      {config.targetLabel ? <div>Target: {config.targetLabel}</div> : null}
    </aside>
  );
}
