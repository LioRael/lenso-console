import { expect, test } from "bun:test";

import {
  validateConsoleFilter,
  type ConsoleFilterField,
  evaluateConsoleFilter,
  matchesConsoleFilterDate,
  validateConsoleFilterGroup,
  summarizeConsoleFilters,
  type ConsoleFilterGroup,
} from "../src/console-filter-model";

test("summaries describe simple filters without flattening Boolean groups", () => {
  const fields: ConsoleFilterField[] = [
    {
      id: "name",
      label: "Name",
      kind: "text",
      operators: ["contains", "equals"],
    },
    {
      id: "status",
      label: "Status",
      kind: "enum",
      options: [{ value: "active", label: "Active" }],
    },
  ];
  const name = {
    id: "name",
    field: "name",
    operator: "contains" as const,
    value: "Alice",
  };
  const status = {
    id: "status",
    field: "status",
    operator: "equals" as const,
    value: "active",
  };
  expect(
    summarizeConsoleFilters(fields, {
      id: "root",
      operator: "and",
      children: [],
    })
  ).toBe("Filters");
  expect(
    summarizeConsoleFilters(fields, {
      id: "root",
      operator: "and",
      children: [status],
    })
  ).toBe("Status: Active");
  expect(
    summarizeConsoleFilters(fields, {
      id: "root",
      operator: "and",
      children: [name],
    })
  ).toBe("Name contains Alice");
  expect(
    summarizeConsoleFilters(fields, {
      id: "root",
      operator: "or",
      children: [name, { id: "group", operator: "and", children: [status] }],
    })
  ).toBe("Custom filters · 2 conditions");
});

// Drafts must not become predicates while a typed value/range is incomplete.
test("rejects incomplete, reversed and non-finite numeric predicates", () => {
  const field: ConsoleFilterField = {
    id: "age",
    label: "Age",
    kind: "number",
    operators: ["equals", "gt", "between"],
  };
  const base = { id: "test", field: "age" };
  expect(
    validateConsoleFilter(field, {
      ...base,
      operator: "between",
      value: ["18", ""],
    })
  ).not.toBeNull();
  expect(
    validateConsoleFilter(field, {
      ...base,
      operator: "between",
      value: ["30", "18"],
    })
  ).not.toBeNull();
  expect(
    validateConsoleFilter(field, { ...base, operator: "gt", value: "Infinity" })
  ).not.toBeNull();
  expect(
    validateConsoleFilter(field, {
      ...base,
      operator: "between",
      value: ["18", "30"],
    })
  ).toBeNull();
});

test("only admits field-supported rules and enum values", () => {
  const field: ConsoleFilterField = {
    id: "status",
    label: "Status",
    kind: "enum",
    options: [{ value: "active", label: "Active" }],
  };
  const base = { id: "test", field: "status", value: "active" };
  expect(
    validateConsoleFilter(field, { ...base, operator: "contains" })
  ).not.toBeNull();
  expect(
    validateConsoleFilter(field, {
      ...base,
      operator: "equals",
      value: "unknown",
    })
  ).not.toBeNull();
  expect(
    validateConsoleFilter(field, { ...base, operator: "equals" })
  ).toBeNull();
});

test("nested OR preserves parentheses and ignores empty editing groups", () => {
  const group: ConsoleFilterGroup = {
    id: "root",
    operator: "and",
    children: [
      { id: "a", field: "name", operator: "contains", value: "A" },
      {
        id: "nested",
        operator: "or",
        children: [
          { id: "b", field: "status", operator: "equals", value: "active" },
          { id: "c", field: "status", operator: "equals", value: "external" },
          { id: "empty", operator: "and", children: [] },
        ],
      },
    ],
  };
  expect(
    evaluateConsoleFilter(group, (condition) => condition.id === "a")
  ).toBe(false);
  expect(
    evaluateConsoleFilter(
      group,
      (condition) => condition.id === "a" || condition.id === "c"
    )
  ).toBe(true);
  expect(
    evaluateConsoleFilter(group, (condition) => condition.id === "c")
  ).toBe(false);
  expect(
    evaluateConsoleFilter(
      { id: "empty-root", operator: "or", children: [] },
      () => false
    )
  ).toBe(true);
});

test("calendar dates reject rollover and compare inclusive ranges without timezone conversion", () => {
  const field: ConsoleFilterField = {
    id: "created",
    label: "Created",
    kind: "date",
    operators: ["on", "before", "after", "between"],
  };
  const base = { id: "date", field: "created" };
  expect(
    validateConsoleFilter(field, {
      ...base,
      operator: "on",
      value: "2023-02-29",
    })
  ).not.toBeNull();
  expect(
    validateConsoleFilter(field, {
      ...base,
      operator: "on",
      value: "2024-02-29",
    })
  ).toBeNull();
  expect(
    validateConsoleFilter(field, {
      ...base,
      operator: "between",
      value: ["2024-03-01", "2024-02-29"],
    })
  ).not.toBeNull();
  expect(
    matchesConsoleFilterDate("2024-02-29", {
      ...base,
      operator: "before",
      value: "2024-02-29",
    })
  ).toBe(false);
  expect(
    matchesConsoleFilterDate("2024-03-01", {
      ...base,
      operator: "after",
      value: "2024-02-29",
    })
  ).toBe(true);
  const range = {
    ...base,
    operator: "between" as const,
    value: ["2024-02-29", "2024-03-01"] as const,
  };
  expect(matchesConsoleFilterDate("2024-02-29", range)).toBe(true);
  expect(matchesConsoleFilterDate("2024-03-01", range)).toBe(true);
  expect(matchesConsoleFilterDate("2024-03-02", range)).toBe(false);
});

test("condition trees enforce unique IDs and bounded nesting and size", () => {
  const field: ConsoleFilterField = {
    id: "name",
    label: "Name",
    kind: "text",
    operators: ["equals"],
  };
  const leaf = {
    id: "leaf",
    field: "name",
    operator: "equals" as const,
    value: "Alice",
  };
  expect(
    validateConsoleFilterGroup([field], {
      id: "root",
      operator: "and",
      children: [leaf, leaf],
    })
  ).not.toBeNull();
  let tree: ConsoleFilterGroup = {
    id: "inner",
    operator: "or",
    children: [leaf],
  };
  for (let index = 0; index < 4; index += 1) {
    tree = { id: `group-${index}`, operator: "and", children: [tree] };
  }
  expect(validateConsoleFilterGroup([field], tree)).not.toBeNull();
  expect(
    validateConsoleFilterGroup([field], {
      id: "root",
      operator: "and",
      children: Array.from({ length: 50 }, (_, i) => ({ ...leaf, id: `${i}` })),
    })
  ).not.toBeNull();
});
