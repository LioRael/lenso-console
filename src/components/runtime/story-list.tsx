import { stylexClassName, useConsoleLocale } from "@lenso/console-ui";
import { RefreshCcw, Search } from "lucide-react";

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
      className={stylexClassName(
        `runtime-stories-explorer grid h-full min-h-0 min-w-0 grid-rows-[60px_1px_40px_1px_26px_1px_minmax(0,1fr)] overflow-hidden bg-(--bg-canvas) ${className ?? ""}`
      )}
    >
      <div
        className={stylexClassName(
          "flex h-[60px] items-center justify-between gap-2 bg-(--bg-canvas) px-3.5"
        )}
      >
        <div>
          <h2
            className={stylexClassName(
              "text-sm font-semibold text-(--fg-primary)"
            )}
          >
            {zh ? "业务故事" : "Stories"}
          </h2>
          <p
            className={stylexClassName(
              "font-sans text-[10px] text-(--fg-tertiary)"
            )}
          >
            platform-story&nbsp; · &nbsp;{stories.length}{" "}
            {zh ? "个关联" : "correlations"}
          </p>
        </div>
        <button
          aria-label={zh ? "刷新故事" : "Refresh stories"}
          className={stylexClassName(
            "grid size-4 place-items-center text-(--fg-tertiary) hover:text-(--fg-primary)"
          )}
          onClick={() => window.location.reload()}
          type="button"
        >
          <RefreshCcw size={13} />
        </button>
      </div>
      <div className={stylexClassName("h-px bg-(--line-subtle)")} />
      <div
        className={stylexClassName(
          "flex h-10 items-center gap-[9px] px-3.5 text-(--fg-tertiary)"
        )}
      >
        <Search size={12} />
        <input
          aria-label="Search stories"
          className={stylexClassName(
            "w-full bg-transparent font-mono text-[10px] text-(--fg-primary) outline-hidden placeholder:text-(--fg-quaternary) focus-visible:outline-2 focus-visible:outline-(--focus-ring) focus-visible:outline-offset-1"
          )}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            zh
              ? "筛选故事 / 服务 / 关联…"
              : "filter story / service / correlation…"
          }
          value={query}
        />
      </div>
      <div className={stylexClassName("h-px bg-(--line-subtle)")} />
      <div
        className={stylexClassName(
          "flex h-[26px] items-center justify-between px-3.5 font-sans text-[10px] font-medium text-(--fg-tertiary)"
        )}
      >
        <span>{zh ? "故事" : "story"}</span>
        <span>{zh ? "状态" : "state"}</span>
      </div>
      <div className={stylexClassName("h-px bg-(--line-subtle)")} />
      <div className={stylexClassName("min-h-0 overflow-auto")}>
        {stories.length === 0 ? (
          <div
            className={stylexClassName(
              "p-4 text-[12px] leading-5 text-(--fg-tertiary)"
            )}
          >
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
            <div key={story.id}>
              <button
                aria-pressed={isSelected}
                className={cn(
                  "flex h-[104px] w-full flex-col gap-[6px] overflow-hidden px-3 pt-3 pb-2.5 text-left transition-colors",
                  isSelected
                    ? "bg-(--bg-row-selected)"
                    : "hover:bg-(--bg-row-hover)"
                )}
                onClick={() => onSelect(story)}
                type="button"
              >
                <div
                  className={stylexClassName(
                    "flex h-[18px] w-full items-center gap-1.5"
                  )}
                >
                  <span
                    className={stylexClassName(
                      "size-1.5 shrink-0 rounded-full"
                    )}
                    style={{
                      backgroundColor: statusColor(storySummary.status),
                    }}
                  />
                  <span
                    className={stylexClassName(
                      "w-[120px] shrink-0 truncate text-[12px] font-medium text-(--fg-primary)"
                    )}
                    style={{
                      fontVariationSettings: '"wdth" 100',
                      height: 16,
                      lineHeight: "16px",
                    }}
                  >
                    {storySummary.title}
                  </span>
                  <span
                    className={cn(
                      "font-sans text-[8.5px] font-medium leading-[14px]",
                      isError
                        ? "text-(--tone-error-fg)"
                        : "text-(--fg-tertiary)"
                    )}
                    style={{ fontVariationSettings: '"wdth" 100' }}
                  >
                    {storySummary.status}
                  </span>
                </div>

                <p
                  className={stylexClassName(
                    "font-mono text-[10px] leading-[14px] text-(--fg-secondary)"
                  )}
                  style={{ whiteSpace: "pre" }}
                >
                  {`${formatRuntimeDuration(storySummary.duration)}  ·  ${storySummary.nodeCount} nodes  ·  ${storySummary.errorCount} errors`}
                </p>

                <div
                  className={cn(
                    "truncate text-[10px] leading-[14px]",
                    isError && storySummary.rootError
                      ? "text-(--tone-error-fg)"
                      : "text-(--fg-secondary)"
                  )}
                  style={{ fontVariationSettings: '"wdth" 100' }}
                >
                  {isError && storySummary.rootError
                    ? storySummary.rootError
                    : storySummary.patternLabel || "No execution pattern"}
                </div>

                <div
                  className={stylexClassName(
                    "flex h-[18px] min-w-0 items-center gap-1 font-mono text-[8.5px]"
                  )}
                >
                  {storySummary.services.slice(0, 3).map((service) => (
                    <span
                      className={stylexClassName("max-w-16 truncate")}
                      key={service}
                      style={{ color: serviceColor(service) }}
                    >
                      {service}
                    </span>
                  ))}
                  <span
                    className={stylexClassName(
                      "h-px min-w-2 flex-1 bg-(--line-subtle)"
                    )}
                  />
                  <span
                    className={stylexClassName(
                      "max-w-18 truncate text-[7.5px] text-(--fg-tertiary)"
                    )}
                    style={{
                      fontVariationSettings: '"wdth" 100',
                      lineHeight: "12px",
                    }}
                    title={storySummary.correlationId}
                  >
                    {shortCorrelation(storySummary.correlationId)}
                  </span>
                </div>
              </button>
              <div className={stylexClassName("h-px bg-(--line-subtle)")} />
            </div>
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
