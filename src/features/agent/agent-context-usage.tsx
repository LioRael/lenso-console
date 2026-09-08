import { Tooltip } from "@lenso/ui/tooltip";
import * as stylex from "@stylexjs/stylex";

import { composerOverlayStyles as overlay } from "./agent-composer-overlay.stylex";
import { contextUsage } from "./agent-context-usage-model";
import type { AgentModel, AgentTrajectory } from "./agent-runtime";

const number = (v: number) =>
  Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
export function AgentContextUsage({
  model,
  trajectory,
  draft,
  align = "end",
}: {
  model: AgentModel | undefined;
  trajectory: AgentTrajectory | undefined;
  draft: string;
  align?: "start" | "end";
}) {
  const value = contextUsage(model, trajectory, draft);
  return (
    <Tooltip.Provider delay={150}>
      <Tooltip.Root>
        <Tooltip.Trigger
          aria-label="Context usage"
          {...stylex.props(s.trigger)}
        >
          <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="currentColor"
              opacity=".22"
              strokeWidth="2.5"
            />
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              pathLength="100"
              strokeDasharray={`${value.percent ?? 0} 100`}
              transform="rotate(-90 10 10)"
            />
          </svg>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner
            side="top"
            align={align}
            sideOffset={8}
            xstyle={overlay.positioner}
          >
            <Tooltip.Popup xstyle={s.popup}>
              <strong>Context window</strong>
              <span>
                {value.percent === undefined
                  ? "Usage not reported yet"
                  : `${value.percent}% used · ${100 - value.percent}% remaining`}
              </span>
              <span>
                {value.used === undefined ? "—" : number(value.used)} /{" "}
                {value.limit ? number(value.limit) : "Unknown"} tokens
              </span>
              <small>
                Last model input{value.draftTokens ? " + estimated draft" : ""}.
                Updated after each model call.
              </small>
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
const s = stylex.create({
  trigger: {
    display: "grid",
    placeItems: "center",
    height: "24px",
    width: "24px",
    border: 0,
    borderRadius: "999px",
    backgroundColor: "transparent",
    color: "var(--color-content-secondary)",
    cursor: "pointer",
  },
  popup: {
    height: "auto",
    minHeight: 0,
    paddingBlock: "12px",
    paddingInline: "12px",
    whiteSpace: "normal",
    lineHeight: "18px",
    maxWidth: "calc(100vw - 32px)",
    width: "220px",
    display: "grid",
    gap: "5px",
    padding: "12px",
    borderRadius: "10px",
    backgroundColor: "var(--color-surface-panel)",
    border: "1px solid var(--color-border-secondary)",
    boxShadow: "0 4px 20px rgb(0 0 0 / 12%)",
    fontSize: "12px",
    color: "var(--color-content-secondary)",
  },
});
