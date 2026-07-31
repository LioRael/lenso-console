import { AlertCircle, Boxes, Clock, Search } from "lucide-react";

import type { RuntimeStory } from "../../data/mock-runtime";
import { cn } from "../../lib/cn";
import { formatRuntimeDuration, statusColor } from "../../lib/runtime-style";
import { buildRuntimeStory } from "../../lib/story";

export function StoryList({
  query,
  selectedStoryId,
  setQuery,
  stories,
  onSelect,
}: {
  stories: RuntimeStory[];
  selectedStoryId: string | null;
  query: string;
  setQuery: (query: string) => void;
  onSelect: (story: RuntimeStory) => void;
}) {
  return (
    <aside className="grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden bg-(--bg-canvas)">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-(--line) bg-(--bg-canvas) px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-(--fg-primary)">
            Stories
          </h2>
          <p className="text-xs text-(--fg-tertiary)">
            {stories.length} correlations
          </p>
        </div>
      </div>
      <div className="flex h-8 items-center gap-2 border-b border-(--line) px-3 text-(--fg-tertiary)">
        <Search size={12} />
        <input
          aria-label="Search stories"
          className="mono w-full bg-transparent text-xs text-(--fg-primary) outline-hidden placeholder:text-(--fg-quaternary)"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="filter story / service / correlation..."
          value={query}
        />
      </div>
      <div className="grid h-6 grid-cols-[12px_minmax(0,1fr)_58px] items-center gap-2 border-b border-(--line) bg-(--bg-panel-header) px-3 text-[10px] font-semibold uppercase text-(--fg-tertiary)">
        <span />
        <span>story</span>
        <span className="text-right">state</span>
      </div>
      <div className="min-h-0 overflow-auto">
        {stories.length === 0 ? (
          <div className="p-4 text-[12px] leading-5 text-(--fg-tertiary)">
            No stories match the current filter.
          </div>
        ) : null}
        {stories.map((story) => {
          const storySummary = buildRuntimeStory(story);
          const isError =
            storySummary.status === "failed" || storySummary.status === "dead";
          const isSelected = selectedStoryId === story.id;

          return (
            <button
              className={cn(
                "relative w-full border-b border-(--line) py-2 pr-3 pl-4 text-left transition-colors",
                isError &&
                  "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-(--error)",
                isSelected ? "native-selection" : "hover:bg-(--bg-row-hover)"
              )}
              key={story.id}
              onClick={() => onSelect(story)}
              type="button"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: statusColor(storySummary.status) }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-(--fg-primary)">
                  {storySummary.title}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isError ? "text-(--tone-error-fg)" : "text-(--fg-tertiary)"
                  )}
                >
                  {storySummary.status}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-(--fg-secondary)">
                <Metric icon={<Clock size={10} />}>
                  {formatRuntimeDuration(storySummary.duration)}
                </Metric>
                <span className="text-(--line)">·</span>
                <Metric icon={<Boxes size={10} />}>
                  {storySummary.nodeCount}
                </Metric>
                {storySummary.errorCount > 0 ? (
                  <>
                    <span className="text-(--line)">·</span>
                    <Metric
                      className="text-(--tone-error-fg)"
                      icon={<AlertCircle size={10} />}
                    >
                      {storySummary.errorCount}
                    </Metric>
                  </>
                ) : null}
                <span
                  className="ml-auto truncate text-[10px] text-(--fg-tertiary)"
                  title={storySummary.correlationId}
                >
                  {shortCorrelation(storySummary.correlationId)}
                </span>
              </div>

              {isError && storySummary.rootError ? (
                <div className="mt-1.5 truncate text-[11px] leading-4 text-(--tone-error-fg)">
                  {storySummary.rootError}
                </div>
              ) : (
                <div className="mt-1.5 truncate text-[11px] leading-4 text-(--fg-secondary)">
                  {storySummary.patternLabel || "No execution pattern"}
                </div>
              )}

              <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                {storySummary.services.slice(0, 4).map((service) => (
                  <span
                    className="max-w-24 truncate rounded border border-(--line) bg-(--bg-control) px-1.5 py-0.5 text-[10px] text-(--fg-tertiary)"
                    key={service}
                  >
                    {service}
                  </span>
                ))}
                {storySummary.services.length > 4 ? (
                  <span className="rounded border border-(--line) bg-(--bg-control) px-1.5 py-0.5 text-[10px] text-(--fg-tertiary)">
                    +{storySummary.services.length - 4}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function shortCorrelation(correlationId: string) {
  const tail = correlationId.split("-").at(-1) ?? correlationId;
  return tail.length > 12 ? `…${tail.slice(-12)}` : `…${tail}`;
}

function Metric({
  children,
  className,
  icon,
}: {
  children: React.ReactNode;
  className?: string;
  icon: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {icon}
      {children}
    </span>
  );
}
