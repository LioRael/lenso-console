import type { ConsoleCornerArea } from "./console-layout";

export type ConsoleTableGroupKind =
  | "query"
  | "filter"
  | "insertion"
  | "view"
  | "navigation"
  | "commit";
export type ConsoleTablePlacement = ConsoleCornerArea | "inline";
export type ConsoleTablePlacements = Partial<
  Record<ConsoleTableGroupKind, ConsoleTablePlacement>
>;

export interface ConsoleTableControls {
  /** Optional contextual layout editor; business pages do not show it by default. */
  customization?: boolean;
  placements?: ConsoleTablePlacements;
  onPlacementsChange?: (placements: ConsoleTablePlacements) => void;
  /** Viewport coverage, not the fraction of a potentially very tall table. */
  enterCoverage?: number;
  exitCoverage?: number;
  dwellMs?: number;
}

export const defaultConsoleTablePlacements: Record<
  ConsoleTableGroupKind,
  ConsoleTablePlacement
> = {
  query: "topLeft",
  filter: "topRight",
  insertion: "topRight",
  view: "bottomLeft",
  navigation: "bottomRight",
  commit: "topRight",
};

export interface TableCandidate {
  id: string;
  mode: "page" | "embedded";
  coverage: number;
  locked: boolean;
}

/** One decision rule for document scrolling, nested scrolling and explicit focus. */
export function chooseTableContext(
  candidates: readonly TableCandidate[],
  current: string | null,
  options: {
    blocked: boolean;
    focused: string | null;
    pageFocused?: boolean;
    explicit: string | null;
    enter: number;
    exit: number;
  }
) {
  const incumbent = candidates.find((entry) => entry.id === current);
  if (incumbent && (options.blocked || incumbent.locked)) {
    return incumbent.id;
  }
  const chosen = candidates.find((entry) => entry.id === options.explicit);
  if (chosen) {
    return chosen.id;
  }
  if (options.pageFocused) {
    return candidates.find((entry) => entry.mode === "page")?.id ?? null;
  }
  const preferred = candidates.find((entry) => entry.id === options.focused);
  if (preferred) {
    return preferred.id;
  }
  if (incumbent?.mode === "embedded" && incumbent.coverage >= options.exit) {
    return incumbent.id;
  }
  const eligible = candidates
    .filter(
      (entry) => entry.mode === "embedded" && entry.coverage >= options.enter
    )
    .sort((a, b) => b.coverage - a.coverage);
  return (
    eligible[0]?.id ??
    candidates.find((entry) => entry.mode === "page")?.id ??
    null
  );
}
