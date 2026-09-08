import * as stylex from "@stylexjs/stylex";
import { useId, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div
      {...stylex.props(s.root)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Context usage"
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
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
      </button>
      {open ? (
        <div
          id={id}
          role="tooltip"
          {...stylex.props(s.popup, align === "start" && s.start)}
        >
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
        </div>
      ) : null}
    </div>
  );
}
const s = stylex.create({
  root: { position: "relative", display: "inline-flex" },
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
  start: { insetInlineStart: 0, insetInlineEnd: "auto" },
  popup: {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    insetInlineEnd: 0,
    maxWidth: "calc(100vw - 32px)",
    zIndex: 40,
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
