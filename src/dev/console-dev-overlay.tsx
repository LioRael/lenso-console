import { stylexClassName } from "@lenso/console-ui";

import type { ConsoleDevConfig } from "./console-dev-config";

export function ConsoleDevOverlay({ config }: { config: ConsoleDevConfig }) {
  if (!config.enabled || (!config.diagnosticsUrl && !config.targetLabel)) {
    return null;
  }

  return (
    <aside
      className={stylexClassName(
        "fixed right-3 bottom-3 z-50 rounded-[var(--radius-panel)] border border-(--line) bg-(--bg-panel) px-3 py-2 text-xs text-(--fg-secondary) shadow-(--elevation-panel)"
      )}
    >
      <div className={stylexClassName("font-semibold text-(--fg-primary)")}>
        Console Dev
      </div>
      <div>Mode: {config.mode}</div>
      {config.targetLabel ? <div>Target: {config.targetLabel}</div> : null}
    </aside>
  );
}
