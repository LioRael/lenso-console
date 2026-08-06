import { stylexClassName } from "@lenso/console-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/cn";
import { prettyJson } from "../../lib/format";

type JsonViewerProps = {
  bordered?: boolean;
  className?: string;
  countLabel?: string;
  title: string;
  value: unknown;
  defaultExpanded?: boolean;
  variant?: "default" | "payload-row";
};

export function JsonViewer({
  bordered = true,
  className,
  countLabel,
  title,
  value,
  defaultExpanded = false,
  variant = "default",
}: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const json = prettyJson(value);
  const count = jsonFieldCount(value);
  const payloadRow = variant === "payload-row";

  return (
    <section
      className={cn(
        "overflow-hidden bg-(--bg-canvas)",
        payloadRow && "shrink-0",
        payloadRow && "h-[52px]",
        bordered && "border-b border-(--line-subtle)",
        className
      )}
    >
      <button
        className={cn(
          "flex h-[52px] w-full items-center px-3 pt-2.5 pb-[9px] text-left hover:bg-(--bg-control-hover)",
          payloadRow ? "justify-between" : "gap-2"
        )}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {payloadRow ? (
          <span className={stylexClassName("flex items-center gap-2")}>
            {expanded ? (
              <ChevronDown
                className={stylexClassName(
                  "size-3 shrink-0 text-(--fg-tertiary)"
                )}
              />
            ) : (
              <ChevronRight
                className={stylexClassName(
                  "size-3 shrink-0 text-(--fg-tertiary)"
                )}
              />
            )}
            <span
              className={stylexClassName(
                "font-sans text-[11px] font-medium text-(--fg-primary)"
              )}
            >
              {title}
            </span>
          </span>
        ) : (
          <>
            {expanded ? (
              <ChevronDown
                className={stylexClassName("size-3 text-(--fg-tertiary)")}
              />
            ) : (
              <ChevronRight
                className={stylexClassName("size-3 text-(--fg-tertiary)")}
              />
            )}
            <span
              className={stylexClassName(
                "font-sans text-[11px] font-medium text-(--fg-primary)"
              )}
            >
              {title}
            </span>
          </>
        )}
        <span
          className={cn(
            "font-mono text-[10px] text-(--fg-tertiary)",
            !payloadRow && "ml-auto"
          )}
        >
          {countLabel ?? `${count} fields`}
        </span>
      </button>
      {expanded ? (
        <div
          className={stylexClassName(
            "max-h-[320px] overflow-auto border-t border-(--line-subtle) px-3 py-2.5 font-mono text-[11px] leading-[15px] text-(--fg-secondary)"
          )}
        >
          <pre className={stylexClassName("whitespace-pre-wrap")}>{json}</pre>
        </div>
      ) : null}
    </section>
  );
}

function jsonFieldCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return 1;
}
