import { useConsoleLocale } from "@lenso/console-ui-internal";
import { AlertCircle, Boxes, Clock, Search } from "lucide-react";

import type { RuntimeStory } from "../../data/mock-runtime";
import { cn } from "../../lib/cn";
import {
  formatRuntimeDuration,
  serviceColor,
  statusColor,
} from "../../lib/runtime-style";
import { buildRuntimeStory } from "../../lib/story";

export function StoryList({
  className,
  query,
  selectedStoryId,
  setQuery,
  stories,
  onSelect,
}: {
  className?: string;
  stories: RuntimeStory[];
  selectedStoryId: string | null;
  query: string;
  setQuery: (query: string) => void;
  onSelect: (story: RuntimeStory) => void;
}) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  return (
    <aside
      className={`runtime-stories-explorer grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden bg-(--bg-canvas) ${className ?? ""}`}
    >
      <div className="flex h-[60px] items-center justify-between gap-2 border-b border-(--line) bg-(--bg-canvas) px-3.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-(--fg-primary)">
            {zh ? "业务故事" : "Stories"}
          </h2>
          <p className="font-mono text-[9px] text-(--fg-tertiary)">
            platform-story&nbsp; · &nbsp;{stories.length}{" "}
            {zh ? "个关联" : "correlations"}
          </p>
        </div>
      </div>
      <div className="flex h-10 items-center gap-2 border-b border-(--line) px-3 text-(--fg-tertiary)">
        <Search size={12} />
        <input
          aria-label="Search stories"
          className="mono w-full bg-transparent text-xs text-(--fg-primary) outline-hidden placeholder:text-(--fg-quaternary) focus-visible:outline-2 focus-visible:outline-(--focus-ring) focus-visible:outline-offset-1"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            zh
              ? "筛选故事 / 服务 / 关联..."
              : "filter story / service / correlation..."
          }
          value={query}
        />
      </div>
      <div className="grid h-[26px] grid-cols-[minmax(0,1fr)_58px] items-center gap-2 border-b border-(--line) bg-(--bg-panel-header) px-3.5 text-[9px] text-(--fg-tertiary)">
        <span>{zh ? "故事" : "story"}</span>
        <span className="text-right">{zh ? "状态" : "state"}</span>
      </div>
      <div className="min-h-0 overflow-auto">
        {stories.length === 0 ? (
          <div className="p-4 text-[12px] leading-5 text-(--fg-tertiary)">
            {zh
              ? "没有符合当前筛选条件的故事。"
              : "No stories match the current filter."}
          </div>
        ) : null}
        {stories.map((story) => {
          const storySummary = buildRuntimeStory(story);
          const isError =
            storySummary.status === "failed" || storySummary.status === "dead";
          const isSelected = selectedStoryId === story.id;

          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "relative h-[120px] w-full overflow-hidden border-b border-(--line) p-3 text-left transition-colors",
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

              <div className="mt-1.5 flex min-w-0 items-center gap-2 font-mono text-[9px]">
                {storySummary.services.slice(0, 3).map((service) => (
                  <span
                    className="max-w-16 truncate"
                    key={service}
                    style={{ color: serviceColor(service) }}
                  >
                    {service}
                  </span>
                ))}
                <span className="h-px min-w-2 flex-1 bg-(--line-subtle)" />
                <span
                  className="max-w-18 truncate text-[8px] text-(--fg-tertiary)"
                  title={storySummary.correlationId}
                >
                  {shortCorrelation(storySummary.correlationId)}
                </span>
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
