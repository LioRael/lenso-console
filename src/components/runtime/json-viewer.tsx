import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { prettyJson } from "../../lib/format";

type JsonViewerProps = {
  title: string;
  value: unknown;
  defaultExpanded?: boolean;
};

export function JsonViewer({
  title,
  value,
  defaultExpanded = false,
}: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const json = prettyJson(value);
  const lines = json.split("\n");

  return (
    <section className="overflow-hidden border-b border-(--line) bg-(--bg-panel)">
      <button
        className="flex w-full items-center gap-2 border-b border-(--line) bg-(--bg-panel-header) px-4 py-2 text-left font-mono text-xs font-semibold text-(--fg-tertiary) hover:bg-(--bg-control-hover)"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        <span className="mono ml-auto text-[11px] text-(--fg-tertiary)">
          {lines.length} lines
        </span>
      </button>
      {expanded ? (
        <div className="overflow-auto bg-(--bg-panel) py-2 font-mono text-xs leading-5">
          {lines.map((line, index) => (
            <div className="grid grid-cols-[36px_minmax(0,1fr)]" key={index}>
              <span className="select-none border-r border-(--line) pr-2 text-right text-(--fg-quaternary)">
                {index + 1}
              </span>
              <code className="whitespace-pre px-3 text-(--fg-secondary)">
                {line || " "}
              </code>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
