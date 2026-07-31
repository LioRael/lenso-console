export const runtimeTableHeaderBaseClassName =
  "grid min-w-0 gap-4 border-b border-(--line) bg-(--bg-panel-header) px-3 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-(--fg-tertiary)";

export const runtimeTimelineTableHeaderClassName = `${runtimeTableHeaderBaseClassName} grid-cols-[minmax(180px,260px)_minmax(0,1fr)] max-md:grid-cols-1`;

export const runtimeWaterfallTableHeaderClassName = `${runtimeTableHeaderBaseClassName} grid-cols-[minmax(200px,240px)_minmax(0,1fr)]`;
