import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
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

import {
  formatConsoleNumber,
  type ConsoleLocale,
} from "../../../../../../packages/console-authoring/src/i18n";
import { useConsoleLocale } from "../../app/console-locale";
import type {
  AgentTrajectory as AgentTrajectoryData,
  AgentTrajectoryKind,
  AgentTrajectoryRecord,
} from "./agent-runtime";
import { agentTrajectoryStyles as styles } from "./agent-trajectory.stylex";

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

export function AgentTrajectory({
  owner,
  trajectory,
}: {
  owner: { id: string; label: string };
  trajectory: AgentTrajectoryData | undefined;
}) {
  const { locale } = useConsoleLocale();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<number>>(
    new Set()
  );
  const records = useMemo(() => trajectory?.records ?? [], [trajectory]);
  const selected = records.find((record) => record.id === selectedId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          !normalizedQuery ||
          `${record.label} ${record.preview} ${record.kind} ${record.status}`
            .toLocaleLowerCase()
            .includes(normalizedQuery)
      ),
    [normalizedQuery, records]
  );
  const groups = [
    ...new Set(
      (normalizedQuery ? matchingRecords : records).map((record) => record.turn)
    ),
  ];

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
    <section aria-label="Agent trajectory" {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.main)}>
        <div {...stylex.props(styles.toolbar)}>
          <div {...stylex.props(styles.summary)}>
            <span
              {...stylex.props(
                styles.liveDot,
                trajectory?.summary.status === "failed" && styles.liveDotFailed,
                ["cancelled", "idle", "completed"].includes(
                  trajectory?.summary.status ?? "loading"
                ) && styles.liveDotIdle,
                ["loading", "running"].includes(
                  trajectory?.summary.status ?? "loading"
                ) && styles.liveDotRunning
              )}
              data-status={trajectory?.summary.status ?? "loading"}
            />
            <span {...stylex.props(styles.statusLabel)}>
              {formatStatus(trajectory?.summary.status)}
            </span>
            <span {...stylex.props(styles.summaryOptional)}>
              Agent · {owner.label}
            </span>
            <span {...stylex.props(styles.summaryOptional)}>
              {trajectory?.summary.turns ?? 0} turns
            </span>
            <span {...stylex.props(styles.summaryOptional)}>
              {trajectory?.summary.modelCalls ?? 0} model calls
            </span>
            <span>{trajectory?.summary.toolCalls ?? 0} tool calls</span>
            {trajectory?.summary.inputTokens ||
            trajectory?.summary.outputTokens ? (
              <span>
                {formatTokens(locale, trajectory.summary.inputTokens)} in ·{" "}
                {formatTokens(locale, trajectory.summary.outputTokens)} out
              </span>
            ) : null}
            {trajectory?.summary.failedOperations ? (
              <span>{trajectory.summary.failedOperations} failed</span>
            ) : null}
          </div>
          <label {...stylex.props(styles.searchField)}>
            <Search aria-hidden="true" size={12} strokeWidth={1.7} />
            <input
              {...stylex.props(styles.searchInput)}
              aria-label="Search trajectory"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search trajectory"
              type="search"
              value={query}
            />
            {query ? (
              <Button
                isIconOnly
                aria-label="Clear trajectory search"
                onClick={() => setQuery("")}
                size="sm"
                variant="ghost"
                xstyle={styles.searchClear}
              >
                <X size={11} />
              </Button>
            ) : null}
          </label>
        </div>
        <div {...stylex.props(styles.ledger)}>
          <div
            aria-hidden="true"
            {...stylex.props(styles.ledgerGrid, styles.ledgerHeader)}
          >
            <span>#</span>
            <span>Event</span>
            <span>Content</span>
            <span>Duration</span>
          </div>
          {groups.map((turn) => {
            const matchingGroupRecords = matchingRecords.filter(
              (record) => record.turn === turn
            );
            const collapsed = collapsedTurns.has(turn);
            const groupRecords = collapsed ? [] : matchingGroupRecords;
            return (
              <div {...stylex.props(styles.turnGroup)} key={turn}>
                <button
                  aria-expanded={!collapsed}
                  {...stylex.props(styles.turnHeader)}
                  onClick={() => toggleTurn(turn)}
                  type="button"
                >
                  {collapsed ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  <span>{turn === 0 ? "Session" : `Turn ${turn}`}</span>
                  <span {...stylex.props(styles.turnMeta)}>
                    {matchingGroupRecords.length}
                    {normalizedQuery
                      ? ` of ${records.filter((record) => record.turn === turn).length}`
                      : ""}{" "}
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
            <div
              {...stylex.props(styles.emptyState, styles.emptyStateLoading)}
              data-loading="true"
            >
              Loading durable trajectory…
            </div>
          )}
          {trajectory && records.length === 0 ? (
            <div {...stylex.props(styles.emptyState)}>
              Trajectory will appear after the first Turn.
            </div>
          ) : null}
          {trajectory &&
          records.length > 0 &&
          normalizedQuery &&
          matchingRecords.length === 0 ? (
            <div aria-live="polite" {...stylex.props(styles.emptyState)}>
              No trajectory records match this filter.
            </div>
          ) : null}
        </div>
      </div>
      {selected ? (
        <TrajectoryInspector
          onClose={() => setSelectedId("")}
          owner={owner}
          record={selected}
          trajectory={trajectory}
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
  const { locale } = useConsoleLocale();
  const meta = kindMeta[record.kind];
  const Icon = meta.icon;
  return (
    <button
      {...stylex.props(
        styles.ledgerGrid,
        styles.row,
        selected && styles.rowSelected
      )}
      data-kind={record.kind}
      data-selected={selected || undefined}
      data-status={record.status}
      onClick={onSelect}
      type="button"
    >
      <span {...stylex.props(styles.index)}>{index}</span>
      <span {...stylex.props(styles.event)}>
        <span {...stylex.props(styles.kindTag, kindStyle(record.kind))}>
          <Icon aria-hidden="true" size={11} strokeWidth={1.8} />
          {meta.label}
        </span>
      </span>
      <span {...stylex.props(styles.content)}>
        <strong
          {...stylex.props(
            styles.contentTitle,
            record.status === "failed" && styles.contentTitleFailed
          )}
        >
          {record.label}
        </strong>
        <span {...stylex.props(styles.contentPreview)}>{record.preview}</span>
      </span>
      <span {...stylex.props(styles.duration)}>
        {record.durationMs === undefined
          ? record.status === "running"
            ? "Running"
            : "—"
          : formatDuration(locale, record.durationMs)}
      </span>
    </button>
  );
}

function kindStyle(kind: AgentTrajectoryKind) {
  switch (kind) {
    case "user": {
      return styles.kindUser;
    }
    case "system":
    case "memory": {
      return styles.kindSystem;
    }
    case "model": {
      return styles.kindModel;
    }
    case "tool": {
      return styles.kindTool;
    }
    case "compaction": {
      return styles.kindCompaction;
    }
    default: {
      return undefined;
    }
  }
}

function TrajectoryInspector({
  onClose,
  owner,
  record,
  trajectory,
}: {
  onClose: () => void;
  owner: { id: string; label: string };
  record: AgentTrajectoryRecord;
  trajectory: AgentTrajectoryData | undefined;
}) {
  const { locale } = useConsoleLocale();
  const meta = kindMeta[record.kind];
  return (
    <aside
      aria-label="Trajectory record details"
      {...stylex.props(styles.inspector)}
    >
      <header {...stylex.props(styles.inspectorHeader)}>
        <div {...stylex.props(styles.inspectorHeaderCopy)}>
          <span {...stylex.props(styles.inspectorKind)}>{meta.label}</span>
          <strong {...stylex.props(styles.inspectorTitle)}>
            {record.label}
          </strong>
        </div>
        <Button
          isIconOnly
          aria-label="Close details"
          onClick={onClose}
          size="sm"
          variant="ghost"
        >
          <X size={13} />
        </Button>
      </header>
      <div {...stylex.props(styles.inspectorBody)}>
        <dl {...stylex.props(styles.facts)}>
          <Fact label="Evidence owner" value={`${owner.label} · ${owner.id}`} />
          <Fact
            label="Session"
            value={trajectory?.sessionId ?? "Unavailable"}
          />
          <Fact
            label="Trajectory revision"
            value={trajectory ? String(trajectory.revision) : "Unavailable"}
          />
          <Fact label="Status" value={record.status} />
          <Fact
            label="Duration"
            value={
              record.durationMs === undefined
                ? "Not recorded"
                : formatDuration(locale, record.durationMs)
            }
          />
          {record.timeToFirstTokenMs === undefined ? null : (
            <Fact
              label="First token"
              value={formatDuration(locale, record.timeToFirstTokenMs)}
            />
          )}
          {record.inputTokens === undefined ? null : (
            <Fact
              label="Input tokens"
              value={formatTokens(locale, record.inputTokens)}
            />
          )}
          {record.outputTokens === undefined ? null : (
            <Fact
              label="Output tokens"
              value={formatTokens(locale, record.outputTokens)}
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
        <section {...stylex.props(styles.detailSection)}>
          <h3 {...stylex.props(styles.detailTitle)}>Summary</h3>
          <p {...stylex.props(styles.detailText)}>{record.detail.summary}</p>
        </section>
        {record.detail.input ? (
          <section {...stylex.props(styles.detailSection)}>
            <h3 {...stylex.props(styles.detailTitle)}>Input</h3>
            <pre {...stylex.props(styles.detailPre)}>{record.detail.input}</pre>
          </section>
        ) : null}
        {record.detail.output ? (
          <section {...stylex.props(styles.detailSection)}>
            <h3 {...stylex.props(styles.detailTitle)}>Output</h3>
            <pre {...stylex.props(styles.detailPre)}>
              {record.detail.output}
            </pre>
          </section>
        ) : null}
        {record.detail.metadataJson ? (
          <section {...stylex.props(styles.detailSection)}>
            <h3 {...stylex.props(styles.detailTitle)}>Metadata</h3>
            <pre {...stylex.props(styles.detailPre)}>
              {record.detail.metadataJson}
            </pre>
          </section>
        ) : null}
        <section {...stylex.props(styles.detailSection)}>
          <h3 {...stylex.props(styles.detailTitle)}>Source events</h3>
          <pre {...stylex.props(styles.detailPre)}>
            {record.sourceEventIds.join("\n")}
          </pre>
        </section>
      </div>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div {...stylex.props(styles.fact)}>
      <dt {...stylex.props(styles.factLabel)}>{label}</dt>
      <dd {...stylex.props(styles.factValue)}>{value}</dd>
    </div>
  );
}

function formatDuration(locale: ConsoleLocale, durationMs: number) {
  const fractionDigits = durationMs < 10_000 ? 1 : 0;
  return durationMs < 1000
    ? `${formatConsoleNumber(locale, durationMs, {
        useGrouping: false,
        maximumFractionDigits: 20,
      })} ms`
    : `${formatConsoleNumber(locale, durationMs / 1000, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
        useGrouping: false,
      })} s`;
}

function formatTokens(locale: ConsoleLocale, tokens: number) {
  return formatConsoleNumber(locale, tokens, { notation: "compact" });
}

function formatStatus(
  status: AgentTrajectoryData["summary"]["status"] | undefined
) {
  if (!status) {
    return "Loading";
  }
  return status.charAt(0).toLocaleUpperCase() + status.slice(1);
}
