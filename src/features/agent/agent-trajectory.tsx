import { IconButton } from "@lenso/ui/icon-button";
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronRight,
  Database,
  Search,
  ShieldCheck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";

import type {
  AgentTrajectory as AgentTrajectoryData,
  AgentTrajectoryKind,
  AgentTrajectoryRecord,
} from "./agent-runtime";

import styles from "./agent-trajectory.module.css";

const kindMeta: Record<
  AgentTrajectoryKind,
  {
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    label: string;
  }
> = {
  compaction: { icon: Archive, label: "COMPACT" },
  memory: { icon: Database, label: "MEMORY" },
  model: { icon: Bot, label: "MODEL" },
  system: { icon: ShieldCheck, label: "SYSTEM" },
  tool: { icon: Wrench, label: "TOOL" },
  user: { icon: UserRound, label: "USER" },
};

const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
});

export function AgentTrajectory({
  trajectory,
}: {
  trajectory: AgentTrajectoryData | undefined;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<number>>(
    new Set()
  );
  const records = useMemo(() => trajectory?.records ?? [], [trajectory]);
  const selected = records.find((record) => record.id === selectedId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          !collapsedTurns.has(record.turn) &&
          (!normalizedQuery ||
            `${record.label} ${record.preview} ${record.kind} ${record.status}`
              .toLocaleLowerCase()
              .includes(normalizedQuery))
      ),
    [collapsedTurns, normalizedQuery, records]
  );
  const groups = [...new Set(records.map((record) => record.turn))];

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
            <span
              className={styles.liveDot}
              data-status={trajectory?.summary.status ?? "loading"}
            />
            <span className={styles.statusLabel}>
              {formatStatus(trajectory?.summary.status)}
            </span>
            <span>{trajectory?.summary.turns ?? 0} turns</span>
            <span>{trajectory?.summary.modelCalls ?? 0} model calls</span>
            <span>{trajectory?.summary.toolCalls ?? 0} tool calls</span>
            {trajectory?.summary.inputTokens ||
            trajectory?.summary.outputTokens ? (
              <span>
                {formatTokens(trajectory.summary.inputTokens)} in ·{" "}
                {formatTokens(trajectory.summary.outputTokens)} out
              </span>
            ) : null}
            {trajectory?.summary.failedOperations ? (
              <span>{trajectory.summary.failedOperations} failed</span>
            ) : null}
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
            <span>Duration</span>
          </div>
          {groups.map((turn) => {
            const groupRecords = visibleRecords.filter(
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
                  <span>{turn === 0 ? "Session" : `Turn ${turn}`}</span>
                  <span className={styles.turnMeta}>
                    {records.filter((record) => record.turn === turn).length}{" "}
                    records
                  </span>
                </button>
                {groupRecords.map((record) => (
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
          {trajectory ? null : (
            <div className={styles.emptyState} data-loading="true">
              Loading durable trajectory…
            </div>
          )}
          {trajectory && records.length === 0 ? (
            <div className={styles.emptyState}>
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
  record: AgentTrajectoryRecord;
  selected: boolean;
}) {
  const meta = kindMeta[record.kind];
  const Icon = meta.icon;
  return (
    <button
      className={styles.row}
      data-kind={record.kind}
      data-selected={selected || undefined}
      data-status={record.status}
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
      <span className={styles.duration}>
        {record.durationMs === undefined
          ? record.status === "running"
            ? "Running"
            : "—"
          : formatDuration(record.durationMs)}
      </span>
    </button>
  );
}

function TrajectoryInspector({
  onClose,
  record,
}: {
  onClose: () => void;
  record: AgentTrajectoryRecord;
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
          <Fact label="Status" value={record.status} />
          <Fact
            label="Duration"
            value={
              record.durationMs === undefined
                ? "Not recorded"
                : formatDuration(record.durationMs)
            }
          />
          {record.timeToFirstTokenMs === undefined ? null : (
            <Fact
              label="First token"
              value={formatDuration(record.timeToFirstTokenMs)}
            />
          )}
          {record.inputTokens === undefined ? null : (
            <Fact
              label="Input tokens"
              value={formatTokens(record.inputTokens)}
            />
          )}
          {record.outputTokens === undefined ? null : (
            <Fact
              label="Output tokens"
              value={formatTokens(record.outputTokens)}
            />
          )}
          {record.detail.model ? (
            <Fact label="Model" value={record.detail.model} />
          ) : null}
          {record.detail.toolCallId ? (
            <Fact label="Call ID" value={record.detail.toolCallId} />
          ) : null}
          <Fact
            label="Source events"
            value={String(record.sourceEventIds.length)}
          />
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
        {record.detail.metadataJson ? (
          <section className={styles.detailSection}>
            <h3>Metadata</h3>
            <pre>{record.detail.metadataJson}</pre>
          </section>
        ) : null}
        <section className={styles.detailSection}>
          <h3>Source events</h3>
          <pre>{record.sourceEventIds.join("\n")}</pre>
        </section>
      </div>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDuration(durationMs: number) {
  return durationMs < 1000
    ? `${durationMs} ms`
    : `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function formatTokens(tokens: number) {
  return compactNumberFormatter.format(tokens);
}

function formatStatus(
  status: AgentTrajectoryData["summary"]["status"] | undefined
) {
  if (!status) {
    return "Loading";
  }
  return status.charAt(0).toLocaleUpperCase() + status.slice(1);
}
