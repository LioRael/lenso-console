export type SystemInventoryFilterValue = "all" | string;

export type SystemInventoryFilters = {
  kind: SystemInventoryFilterValue;
  owner: SystemInventoryFilterValue;
  state: SystemInventoryFilterValue;
};

export type SystemInventoryFilterRow = {
  kind: string;
  owner: string;
  state: string;
};

export function filterSystemInventoryRows<T extends SystemInventoryFilterRow>(
  rows: readonly T[],
  filters: SystemInventoryFilters
): T[] {
  return rows.filter(
    (row) =>
      matchesFilter(row.kind, filters.kind) &&
      matchesFilter(row.owner, filters.owner) &&
      matchesFilter(row.state, filters.state)
  );
}

function matchesFilter(value: string, filter: SystemInventoryFilterValue) {
  return filter === "all" || value === filter;
}
