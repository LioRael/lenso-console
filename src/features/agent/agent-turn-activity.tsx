import * as stylex from "@stylexjs/stylex";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { PluginAgentReceipts } from "../plugins/plugin-agent-receipts";
import { AgentMarkdown } from "./agent-markdown";
import type { AgentToolCall, AgentTurn } from "./agent-runtime";
import { toolErrorDetails } from "./agent-tool-error";
import { businessToolChanges } from "./business-tool-changes";
import { BusinessToolResult } from "./business-tool-result";

const styles = stylex.create({
  root: {
    marginBlock: 4,
    minWidth: 0,
    color: "var(--color-content-secondary)",
    fontSize: 12,
  },
  trigger: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    cursor: "pointer",
    listStyle: "none",
    paddingBlock: 4,
    lineHeight: "18px",
  },
  body: { display: "grid", gap: 4, paddingBlock: 4 },
  label: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  details: { minWidth: 0 },
  panel: {
    display: "grid",
    gap: 8,
    marginBlock: 4,
    marginInlineStart: 6,
    paddingBlock: 4,
    paddingInlineStart: 15,
    borderInlineStartWidth: 1,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: "var(--color-border-tertiary)",
    minWidth: 0,
  },
  parameters: {
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    columnGap: 12,
    rowGap: 4,
    margin: 0,
    fontSize: 12,
  },
  value: { margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  error: {
    margin: 0,
    fontSize: 12,
    lineHeight: "18px",
    overflowWrap: "anywhere",
  },
  imagePreview: { maxWidth: "100%", maxHeight: 480, objectFit: "contain" },
  images: { display: "flex", gap: 8, flexWrap: "wrap" },
  image: { width: 96, height: 96, objectFit: "cover", borderRadius: 8 },
  output: {
    boxSizing: "border-box",
    fontFamily: "var(--font-mono)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    overflowY: "auto",
    maxHeight: 240,
    margin: 0,
    padding: 10,
    fontSize: 12,
    lineHeight: "19px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border-tertiary)",
    borderRadius: 8,
    backgroundColor: "var(--color-surface-panel)",
  },
  hint: { margin: 0, fontSize: 11, color: "var(--color-content-tertiary)" },
});

function parsed(value?: string): Record<string, unknown> {
  try {
    const result: unknown = JSON.parse(value ?? "{}");
    return result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function toolDisplay(tool: AgentToolCall) {
  const args = parsed(tool.argumentsJson);
  const target = [
    args.command,
    args.cmd,
    args.path,
    args.query,
    args.name,
  ].find((value) => typeof value === "string");
  const name = tool.name.toLowerCase();
  const category = /search|grep/u.test(name)
    ? "Searches"
    : /shell|exec|process|terminal/u.test(name)
      ? "Commands"
      : /read|file/u.test(name)
        ? "Files"
        : /image|screenshot/u.test(name)
          ? "Images"
          : "Tools";
  const icon = /search|grep/u.test(name)
    ? Search
    : /shell|exec|process|terminal/u.test(name)
      ? Terminal
      : /read|file/u.test(name)
        ? FileText
        : Wrench;
  const verb =
    tool.status === "running"
      ? "Running"
      : tool.status === "failed"
        ? "Failed"
        : tool.status === "not_run"
          ? "Not run"
          : "Completed";
  return {
    icon,
    category,
    label: `${verb} · ${tool.name}${target ? ` · ${target}` : ""}`,
  };
}

function InputParameter({ name, value }: { name: string; value: string }) {
  return (
    <>
      <dt {...stylex.props(styles.hint)}>{name}</dt>
      <dd {...stylex.props(styles.value)}>{value}</dd>
    </>
  );
}

function ToolDetail({
  tool,
  tools,
}: {
  tool: AgentToolCall;
  tools: AgentToolCall[];
}) {
  const t = useConsoleTranslation();
  const { icon: Icon, label } = toolDisplay(tool);
  const [open, setOpen] = useState(false);
  const failure = tool.error ? toolErrorDetails(tool.error) : undefined;
  const parameters = Object.entries(parsed(tool.argumentsJson));
  const compactInput =
    parameters.length <= 8 &&
    parameters.every(
      ([, value]) =>
        value === null || ["string", "number", "boolean"].includes(typeof value)
    );
  const Arrow = open ? ChevronDown : ChevronRight;
  return (
    <details
      {...stylex.props(styles.details)}
      data-status={tool.status}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary {...stylex.props(styles.trigger)}>
        <Icon size={14} aria-hidden="true" />
        <span {...stylex.props(styles.label)} title={label}>
          {label}
        </span>
        <Arrow size={12} aria-hidden="true" />
      </summary>
      <div {...stylex.props(styles.panel)}>
        {failure ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {failure.summary}
          </p>
        ) : null}
        {failure?.reconnect ? (
          <a href="/settings/connections">{t("Reconnect business App")}</a>
        ) : null}
        {tool.resultImages?.length ? (
          <div {...stylex.props(styles.images)}>
            {tool.resultImages.map((item) => (
              <details key={item.src}>
                <summary {...stylex.props(styles.trigger)}>
                  <img
                    src={item.src}
                    alt={item.name}
                    {...stylex.props(styles.image)}
                  />
                </summary>
                <img
                  src={item.src}
                  alt={item.name}
                  {...stylex.props(styles.imagePreview)}
                />
              </details>
            ))}
          </div>
        ) : null}
        {tool.argumentsJson && parameters.length > 0 ? (
          compactInput ? (
            <dl
              aria-label="Input parameters"
              {...stylex.props(styles.parameters)}
            >
              {parameters.map(([name, value]) => (
                <InputParameter key={name} name={name} value={String(value)} />
              ))}
            </dl>
          ) : (
            <details>
              <summary {...stylex.props(styles.trigger)}>
                Input parameters
              </summary>
              <pre {...stylex.props(styles.output)}>
                {pretty(tool.argumentsJson)}
              </pre>
            </details>
          )
        ) : null}
        {failure ? (
          <details>
            <summary {...stylex.props(styles.trigger)}>
              Error output
              {failure.exitCode ? ` · Exit ${failure.exitCode}` : ""}
            </summary>
            <pre {...stylex.props(styles.output)}>{failure.output}</pre>
            {failure.incomplete ? (
              <p {...stylex.props(styles.hint)}>
                The recorded error was truncated.
              </p>
            ) : null}
            {failure.output === tool.error ? null : (
              <details>
                <summary {...stylex.props(styles.trigger)}>Raw error</summary>
                <pre {...stylex.props(styles.output)}>{tool.error}</pre>
              </details>
            )}
          </details>
        ) : null}
        {tool.resultContent ? (
          <BusinessToolResult
            content={tool.resultContent}
            changes={businessToolChanges(tool, tools)}
          />
        ) : null}
        {tool.resultContent ? (
          <div>
            <p {...stylex.props(styles.hint)}>Output</p>
            <pre {...stylex.props(styles.output)}>
              {pretty(tool.resultContent)}
            </pre>
          </div>
        ) : null}
        {tool.resultTruncated ? (
          <p {...stylex.props(styles.hint)}>
            Output truncated. This preview is not the complete result.
          </p>
        ) : null}
        {tool.metadataJson ? (
          <details>
            <summary {...stylex.props(styles.trigger)}>
              Execution details
            </summary>
            <pre {...stylex.props(styles.output)}>
              {pretty(tool.metadataJson)}
            </pre>
          </details>
        ) : null}
        {typeof tool.durationMs === "number" ? (
          <p {...stylex.props(styles.hint)}>
            {tool.durationMs < 1000
              ? `${tool.durationMs}ms`
              : `${(tool.durationMs / 1000).toFixed(1)}s`}
          </p>
        ) : null}
        {!tool.resultContent && !tool.error ? (
          <p {...stylex.props(styles.hint)}>
            {tool.status === "running"
              ? "Waiting for output…"
              : "No output was recorded."}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function AgentTurnActivity({ turn }: { turn: AgentTurn }) {
  const [expanded, setExpanded] = useState<boolean>();
  const tools = turn.tools ?? [];
  const activity =
    turn.activity ??
    tools.map((tool) => ({ kind: "tool" as const, callId: tool.callId }));
  if (!activity.length && !turn.work) {
    return null;
  }
  const running = turn.status === "running";
  const isOpen = expanded ?? (running || turn.status === "failed");
  const Arrow = isOpen ? ChevronDown : ChevronRight;
  const duration = turn.work?.durationMs;
  const label = running
    ? "Working…"
    : turn.status === "failed"
      ? "Work failed"
      : turn.status === "cancelled"
        ? "Cancelled"
        : typeof duration === "number"
          ? `Worked for ${duration >= 60_000 ? `${Math.floor(duration / 60_000)}m ` : ""}${Math.floor(duration / 1000) % 60}s`
          : "Work completed";
  const groups: ActivityGroup[] = [];
  for (const item of activity) {
    if (item.kind === "text") {
      groups.push(item);
      continue;
    }
    const tool = tools.find((candidate) => candidate.callId === item.callId);
    if (!tool) {
      continue;
    }
    const last = groups.at(-1);
    if (
      last?.kind === "tools" &&
      toolDisplay(last.tools[0]!).category === toolDisplay(tool).category
    ) {
      last.tools.push(tool);
    } else {
      groups.push({ kind: "tools", tools: [tool] });
    }
  }
  return (
    <details
      open={expanded ?? (running || turn.status === "failed")}
      {...stylex.props(styles.root)}
    >
      <summary
        {...stylex.props(styles.trigger)}
        onClick={(event) => {
          event.preventDefault();
          setExpanded(!(expanded ?? (running || turn.status === "failed")));
        }}
      >
        <span>{label}</span>
        <Arrow size={14} aria-hidden="true" />
      </summary>
      <div {...stylex.props(styles.body)}>
        {groups.map((group, index) =>
          group.kind === "text" ? (
            <AgentMarkdown key={`text:${index}`}>{group.text}</AgentMarkdown>
          ) : group.tools.length === 1 ? (
            <ToolDetail
              key={group.tools[0]!.callId}
              tool={group.tools[0]!}
              tools={tools}
            />
          ) : (
            <details key={group.tools[0]!.callId} open={running}>
              <summary {...stylex.props(styles.trigger)}>
                <Terminal size={14} aria-hidden="true" />
                {toolDisplay(group.tools[0]!).category} · {group.tools.length}
                <ChevronRight size={12} aria-hidden="true" />
              </summary>
              {group.tools.map((tool) => (
                <ToolDetail key={tool.callId} tool={tool} tools={tools} />
              ))}
            </details>
          )
        )}
        <PluginAgentReceipts tools={tools} />
        {groups.length === 0 ? (
          <p {...stylex.props(styles.hint)}>
            No detailed activity was recorded for this turn.
          </p>
        ) : null}
      </div>
    </details>
  );
}

type ActivityGroup =
  | { kind: "text"; text: string }
  | { kind: "tools"; tools: AgentToolCall[] };
