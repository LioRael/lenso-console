import { describe, expect, test } from "vitest";

import {
  filterSystemInventoryRows,
  type SystemInventoryFilters,
} from "./system-model";

const rows = [
  { id: "module.auth", kind: "Module", owner: "Identity", state: "Healthy" },
  {
    id: "service.billing",
    kind: "Service",
    owner: "Revenue",
    state: "Healthy",
  },
  {
    id: "service.search",
    kind: "Service",
    owner: "Search",
    state: "Degraded",
  },
];

describe("filterSystemInventoryRows", () => {
  test("matches all active filter dimensions", () => {
    const filters: SystemInventoryFilters = {
      kind: "Service",
      owner: "Revenue",
      state: "Healthy",
    };

    expect(
      filterSystemInventoryRows(rows, filters).map((row) => row.id)
    ).toEqual(["service.billing"]);
  });

  test("keeps all rows when every filter is reset", () => {
    expect(
      filterSystemInventoryRows(rows, {
        kind: "all",
        owner: "all",
        state: "all",
      })
    ).toEqual(rows);
  });
});
