export const runtimeTableHeaderBaseClassName =
  "grid h-7 min-w-0 items-center gap-4 border-b border-(--line) bg-(--bg-panel-header) px-3 font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-(--fg-tertiary)";

export const runtimeTimelineTableHeaderClassName = `${runtimeTableHeaderBaseClassName} grid-cols-[minmax(180px,260px)_minmax(0,1fr)] max-md:grid-cols-1`;

export const runtimeWaterfallTableHeaderClassName = `${runtimeTableHeaderBaseClassName} grid-cols-[minmax(260px,332px)_minmax(232px,1fr)] gap-3`;
