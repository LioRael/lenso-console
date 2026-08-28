import { IconButton } from "@lenso/ui/icon-button";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Search,
  ShieldCheck,
  TerminalSquare,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";

import type { AgentTraceKind, AgentTraceRecord } from "./agent-runtime";

import styles from "./agent-trajectory.module.css";

const kindMeta: Record<
  AgentTraceKind,
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

export function AgentTrajectory({ records }: { records: AgentTraceRecord[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<number>>(
    new Set()
  );
  const selected = records.find((record) => record.id === selectedId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          !collapsedTurns.has(record.turn) &&
          (!normalizedQuery ||
            `${record.label} ${record.preview} ${record.kind}`
              .toLocaleLowerCase()
              .includes(normalizedQuery))
      ),
    [collapsedTurns, normalizedQuery, records]
  );
  const turns = [...new Set(records.map((record) => record.turn))];
  const modelCalls = records.filter(
    (record) => record.label === "Model request"
  ).length;
  const toolCalls = records.filter(
    (record) => record.kind === "tool" && record.preview === "Requested"
  ).length;

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
        <div className={styles.toolbar}>
          <div className={styles.summary}>
            <span className={styles.liveDot} />
            <span>{turns.length} turns</span>
            <span>{modelCalls} model calls</span>
            <span>{toolCalls} tool calls</span>
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
          {turns.map((turn) => {
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
                    {records.filter((record) => record.turn === turn).length}{" "}
                    records
                  </span>
                </button>
                {turnRecords.map((record) => (
                  <TrajectoryRow
                    index={
                      records.findIndex((item) => item.id === record.id) + 1
                    }
                    key={record.id}
                    onSelect={() => setSelectedId(record.id)}
                    record={record}
                    selected={record.id === selectedId}
                  />
                ))}
              </div>
            );
          })}
          {records.length === 0 ? (
            <div className={styles.turnHeader}>
              Trajectory will appear after the first Turn.
            </div>
          ) : null}
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

function TrajectoryRow({
  index,
  onSelect,
  record,
  selected,
}: {
  index: number;
  onSelect: () => void;
  record: AgentTraceRecord;
  selected: boolean;
}) {
  const meta = kindMeta[record.kind];
  const Icon = meta.icon;
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
      </span>
      <span className={styles.content}>
        <strong>{record.label}</strong>
        <span>{record.preview}</span>
      </span>
      <time className={styles.duration} dateTime={record.time}>
        {formatTraceTime(record.time)}
      </time>
    </button>
  );
}

function TrajectoryInspector({
  onClose,
  record,
}: {
  onClose: () => void;
  record: AgentTraceRecord;
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

function formatTraceTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}
