import { IconButton } from "@lenso/ui/icon-button";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Search,
  ShieldCheck,
  TerminalSquare,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";

import styles from "./agent-trajectory.module.css";

type TraceKind = "assistant" | "context" | "system" | "tool" | "user";

type TraceRecord = {
  detail: {
    input?: string;
    output?: string;
    summary: string;
  };
  duration: string;
  id: string;
  kind: TraceKind;
  label: string;
  preview: string;
  step?: number;
  time: string;
  turn: number;
};

const traceRecords: readonly TraceRecord[] = [
  {
    detail: {
      input:
        "Profile: console-management-agent\nAuthority: local-operator\nPolicy: read-only until approved",
      summary:
        "The Console management profile establishes the narrow tool and authority scope for this session.",
    },
    duration: "—",
    id: "system-profile",
    kind: "system",
    label: "Management profile",
    preview: "Read-only Console tools · approvals required for writes",
    time: "10:24:02.000",
    turn: 1,
  },
  {
    detail: {
      input: "Create a customer support workspace",
      summary:
        "The operator asks Console Agent to prepare a new Lenso App workspace.",
    },
    duration: "—",
    id: "user-create",
    kind: "user",
    label: "Create a customer support workspace",
    preview: "Create a customer support workspace",
    time: "10:24:02.118",
    turn: 1,
  },
  {
    detail: {
      input:
        "App: local/support-desk\nGeneration: 12\nAvailable tools: list_plugins, inspect_app",
      summary:
        "A sanitized runtime snapshot was attached. Secrets and environment values are omitted.",
    },
    duration: "3 ms",
    id: "context-runtime",
    kind: "context",
    label: "Runtime context",
    preview: "local/support-desk · Generation 12 · 2 allowed tools",
    time: "10:24:02.121",
    turn: 1,
  },
  {
    detail: {
      input:
        "Create the smallest useful support workspace using installed Plugins.",
      output:
        "I should inspect the current App and available Plugins before proposing changes.",
      summary:
        "The model chose a read-only inspection before proposing a configuration change.",
    },
    duration: "814 ms",
    id: "assistant-plan",
    kind: "assistant",
    label: "Plan next action",
    preview:
      "Inspect the App and available Plugins before changing configuration",
    step: 1,
    time: "10:24:02.129",
    turn: 1,
  },
  {
    detail: {
      input: '{\n  "app": "local/support-desk"\n}',
      output:
        '{\n  "plugins": ["email-intake", "web-intake", "support-queue"]\n}',
      summary:
        "Listed the Plugins already admitted to the selected App. This operation was read-only.",
    },
    duration: "42 ms",
    id: "tool-list-plugins",
    kind: "tool",
    label: "list_plugins",
    preview: "local/support-desk → 3 Plugins",
    step: 1,
    time: "10:24:02.952",
    turn: 1,
  },
  {
    detail: {
      output:
        "I’ll create a minimal support workspace that can be refined later. Which channels should the first version support?",
      summary:
        "The assistant returned a scoped proposal without making a change.",
    },
    duration: "1,126 ms",
    id: "assistant-response",
    kind: "assistant",
    label: "Assistant response",
    preview: "Prepared a minimal support workspace proposal",
    step: 2,
    time: "10:24:03.004",
    turn: 1,
  },
  {
    detail: {
      input: "Use the sensible defaults",
      summary: "The operator accepts the proposed default channels.",
    },
    duration: "—",
    id: "user-defaults",
    kind: "user",
    label: "Use the sensible defaults",
    preview: "Use the sensible defaults",
    time: "10:24:18.210",
    turn: 2,
  },
  {
    detail: {
      input:
        '{\n  "app": "local/support-desk",\n  "plugins": ["email-intake", "web-intake", "support-queue"]\n}',
      output: "Change prepared. Approval is required before activation.",
      summary:
        "Prepared a candidate App configuration. No active Generation was changed.",
    },
    duration: "68 ms",
    id: "tool-prepare",
    kind: "tool",
    label: "prepare_app_change",
    preview: "Candidate Generation 13 · awaiting approval",
    step: 1,
    time: "10:24:18.982",
    turn: 2,
  },
  {
    detail: {
      output: "The support workspace is ready for approval.",
      summary:
        "The assistant surfaced the consequential action instead of silently applying it.",
    },
    duration: "742 ms",
    id: "assistant-approval",
    kind: "assistant",
    label: "Approval requested",
    preview: "Candidate is ready; activation still requires operator approval",
    step: 2,
    time: "10:24:19.055",
    turn: 2,
  },
];

const kindMeta: Record<
  TraceKind,
  {
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    label: string;
  }
> = {
  assistant: { icon: Bot, label: "MODEL" },
  context: { icon: ShieldCheck, label: "CONTEXT" },
  system: { icon: TerminalSquare, label: "SYSTEM" },
  tool: { icon: Wrench, label: "TOOL" },
  user: { icon: UserRound, label: "USER" },
};

const timelineSpans = [
  { kind: "context", label: "Context", lane: 0, start: 2, width: 12 },
  { kind: "assistant", label: "Model", lane: 1, start: 15, width: 24 },
  { kind: "tool", label: "list_plugins", lane: 2, start: 40, width: 9 },
  { kind: "assistant", label: "Response", lane: 1, start: 50, width: 22 },
  { kind: "tool", label: "prepare_app_change", lane: 2, start: 76, width: 10 },
  { kind: "assistant", label: "Approval", lane: 1, start: 87, width: 11 },
] as const;

export function AgentTrajectory() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("tool-prepare");
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<number>>(
    new Set()
  );
  const selected = traceRecords.find((record) => record.id === selectedId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRecords = useMemo(
    () =>
      traceRecords.filter(
        (record) =>
          !collapsedTurns.has(record.turn) &&
          (!normalizedQuery ||
            `${record.label} ${record.preview} ${record.kind}`
              .toLocaleLowerCase()
              .includes(normalizedQuery))
      ),
    [collapsedTurns, normalizedQuery]
  );

  const toggleTurn = (turn: number) => {
    setCollapsedTurns((current) => {
      const next = new Set(current);
      if (next.has(turn)) {
        next.delete(turn);
      } else {
        next.add(turn);
      }
      return next;
    });
  };

  return (
    <section aria-label="Agent trajectory" className={styles.root}>
      <div className={styles.main}>
        <TrajectoryOverview />
        <div className={styles.toolbar}>
          <div className={styles.summary}>
            <span className={styles.liveDot} />
            <span>2 turns</span>
            <span>3 model calls</span>
            <span>2 tool calls</span>
            <span>3.1 s</span>
          </div>
          <label className={styles.searchField}>
            <Search aria-hidden="true" size={12} strokeWidth={1.7} />
            <input
              aria-label="Search trajectory"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search trajectory"
              type="search"
              value={query}
            />
          </label>
        </div>
        <div className={styles.ledger}>
          <div aria-hidden="true" className={styles.ledgerHeader}>
            <span>#</span>
            <span>Event</span>
            <span>Content</span>
            <span>Time</span>
          </div>
          {[1, 2].map((turn) => {
            const turnRecords = visibleRecords.filter(
              (record) => record.turn === turn
            );
            const collapsed = collapsedTurns.has(turn);
            return (
              <div className={styles.turnGroup} key={turn}>
                <button
                  aria-expanded={!collapsed}
                  className={styles.turnHeader}
                  onClick={() => toggleTurn(turn)}
                  type="button"
                >
                  {collapsed ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  <span>Turn {turn}</span>
                  <span className={styles.turnMeta}>
                    {turn === 1 ? "5 records · 2.0 s" : "3 records · 1.1 s"}
                  </span>
                </button>
                {turnRecords.map((record) => (
                  <TrajectoryRow
                    key={record.id}
                    onSelect={() => setSelectedId(record.id)}
                    record={record}
                    selected={record.id === selectedId}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {selected ? (
        <TrajectoryInspector
          onClose={() => setSelectedId("")}
          record={selected}
        />
      ) : null}
    </section>
  );
}

function TrajectoryOverview() {
  return (
    <div className={styles.overview}>
      <div className={styles.overviewHeading}>
        <span>Overview</span>
        <span>10:24:02</span>
        <span>10:24:19</span>
      </div>
      <div className={styles.timeline}>
        <span className={styles.timelineTurn} style={{ left: "1%" }}>
          T1
        </span>
        <span className={styles.timelineTurn} style={{ left: "73%" }}>
          T2
        </span>
        {[0, 1, 2].map((lane) => (
          <div className={styles.timelineLane} key={lane} />
        ))}
        {timelineSpans.map((span) => (
          <button
            aria-label={`${span.label} timeline span`}
            className={styles.timelineSpan}
            data-kind={span.kind}
            key={span.label}
            style={
              {
                "--lane": span.lane,
                "--span-start": `${span.start}%`,
                "--span-width": `${span.width}%`,
              } as CSSProperties
            }
            title={span.label}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

function TrajectoryRow({
  onSelect,
  record,
  selected,
}: {
  onSelect: () => void;
  record: TraceRecord;
  selected: boolean;
}) {
  const meta = kindMeta[record.kind];
  const Icon = meta.icon;
  const index = traceRecords.findIndex((item) => item.id === record.id) + 1;
  return (
    <button
      className={styles.row}
      data-kind={record.kind}
      data-selected={selected || undefined}
      onClick={onSelect}
      type="button"
    >
      <span className={styles.index}>{index}</span>
      <span className={styles.event}>
        <span className={styles.kindTag}>
          <Icon aria-hidden="true" size={11} strokeWidth={1.8} />
          {meta.label}
        </span>
        {record.step ? (
          <span className={styles.step}>S{record.step}</span>
        ) : null}
      </span>
      <span className={styles.content}>
        <strong>{record.label}</strong>
        <span>{record.preview}</span>
      </span>
      <span className={styles.duration}>{record.duration}</span>
    </button>
  );
}

function TrajectoryInspector({
  onClose,
  record,
}: {
  onClose: () => void;
  record: TraceRecord;
}) {
  const meta = kindMeta[record.kind];
  return (
    <aside aria-label="Trajectory record details" className={styles.inspector}>
      <header className={styles.inspectorHeader}>
        <div>
          <span className={styles.inspectorKind}>{meta.label}</span>
          <strong>{record.label}</strong>
        </div>
        <IconButton
          aria-label="Close details"
          onClick={onClose}
          size="compact"
          variant="ghost"
        >
          <X size={13} />
        </IconButton>
      </header>
      <div className={styles.inspectorBody}>
        <dl className={styles.facts}>
          <div>
            <dt>Status</dt>
            <dd className={styles.success}>
              <Check size={12} /> Complete
            </dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              Turn {record.turn}
              {record.step ? ` · Step ${record.step}` : ""}
            </dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{record.time}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>
              <Clock3 size={12} /> {record.duration}
            </dd>
          </div>
        </dl>
        <section className={styles.detailSection}>
          <h3>Summary</h3>
          <p>{record.detail.summary}</p>
        </section>
        {record.detail.input ? (
          <section className={styles.detailSection}>
            <h3>Input</h3>
            <pre>{record.detail.input}</pre>
          </section>
        ) : null}
        {record.detail.output ? (
          <section className={styles.detailSection}>
            <h3>Output</h3>
            <pre>{record.detail.output}</pre>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
