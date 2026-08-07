import { stylexClassName } from "@lenso/console-ui";

export const runtimeTableHeaderBaseClassName = stylexClassName(
  "relative grid h-7 min-w-0 items-center gap-4 bg-(--bg-surface-muted) px-3 font-sans text-[9px] font-medium normal-case tracking-normal text-(--fg-tertiary)"
);

export const runtimeTimelineTableHeaderClassName = stylexClassName(
  `${runtimeTableHeaderBaseClassName} grid-cols-[minmax(180px,260px)_minmax(0,1fr)] max-md:grid-cols-1`
);

export const runtimeWaterfallTableHeaderClassName = stylexClassName(
  `${runtimeTableHeaderBaseClassName} grid-cols-[332px_232px] gap-3`
);
