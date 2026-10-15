export type ConsoleFilterOperator =
  | "contains"
  | "equals"
  | "gt"
  | "lt"
  | "on"
  | "before"
  | "after"
  | "between";

type FieldIdentity = { id: string; label: string };
export type ConsoleFilterField = FieldIdentity &
  (
    | {
        kind: "text";
        operators: readonly ("contains" | "equals")[];
        maxLength?: number;
      }
    | {
        kind: "number";
        operators: readonly ("equals" | "gt" | "lt" | "between")[];
      }
    | {
        /** Calendar dates, YYYY-MM-DD. Timestamp-to-calendar conversion belongs to the owner. */
        kind: "date";
        operators: readonly ("on" | "before" | "after" | "between")[];
      }
    | { kind: "enum"; options: readonly { value: string; label: string }[] }
  );

export type ConsoleFilterCondition = {
  id: string;
  field: string;
} & (
  | { operator: Exclude<ConsoleFilterOperator, "between">; value: string }
  | { operator: "between"; value: readonly [string, string] }
);

export const consoleFilterOperatorLabels: Record<
  ConsoleFilterOperator,
  string
> = {
  contains: "contains",
  equals: "equals",
  gt: "is greater than",
  lt: "is less than",
  on: "is on",
  before: "is before",
  after: "is after",
  between: "is between",
};

export function consoleFilterOperators(
  field: ConsoleFilterField
): readonly ConsoleFilterOperator[] {
  return field.kind === "enum" ? ["equals"] : field.operators;
}

export function createConsoleFilterCondition(
  field: ConsoleFilterField,
  id: string
): ConsoleFilterCondition {
  const operator = consoleFilterOperators(field)[0] ?? "equals";
  return operator === "between"
    ? { id, field: field.id, operator, value: ["", ""] }
    : {
        id,
        field: field.id,
        operator,
        value: field.kind === "enum" ? (field.options[0]?.value ?? "") : "",
      };
}

export function changeConsoleFilterOperator(
  condition: ConsoleFilterCondition,
  operator: ConsoleFilterOperator
): ConsoleFilterCondition {
  if (operator === "between") {
    return {
      ...condition,
      operator,
      value:
        condition.operator === "between"
          ? condition.value
          : [condition.value, ""],
    };
  }
  return {
    ...condition,
    operator,
    value:
      condition.operator === "between" ? condition.value[0] : condition.value,
  };
}

export function changeConsoleFilterValue(
  condition: ConsoleFilterCondition,
  index: 0 | 1,
  value: string
): ConsoleFilterCondition {
  if (condition.operator === "between") {
    const values: [string, string] = [...condition.value];
    values[index] = value;
    return { ...condition, value: values };
  }
  return index === 0 ? { ...condition, value } : condition;
}

export function validateConsoleFilter(
  field: ConsoleFilterField | undefined,
  condition: ConsoleFilterCondition
): string | null {
  if (
    !field ||
    field.id !== condition.field ||
    !consoleFilterOperators(field).includes(condition.operator)
  ) {
    return "Choose a supported field and rule.";
  }
  if (condition.operator === "between") {
    const [lower, upper] = condition.value;
    if (field.kind === "date") {
      if (!isConsoleFilterDate(lower) || !isConsoleFilterDate(upper)) {
        return "Enter both dates in YYYY-MM-DD format.";
      }
      return lower > upper
        ? "The start date must not exceed the end date."
        : null;
    }
    if (
      !lower.trim() ||
      !upper.trim() ||
      !Number.isFinite(Number(lower)) ||
      !Number.isFinite(Number(upper))
    ) {
      return "Enter both numeric bounds.";
    }
    return Number(lower) > Number(upper)
      ? "The lower bound must not exceed the upper bound."
      : null;
  }
  if (!condition.value.trim()) {
    return "Enter a value.";
  }
  if (field.kind === "date" && !isConsoleFilterDate(condition.value)) {
    return "Enter a valid date in YYYY-MM-DD format.";
  }
  if (
    field.kind === "text" &&
    field.maxLength !== undefined &&
    condition.value.length > field.maxLength
  ) {
    return `Use at most ${field.maxLength} characters.`;
  }
  if (
    field.kind === "enum" &&
    !field.options.some((option) => option.value === condition.value)
  ) {
    return "Choose an available value.";
  }
  if (field.kind === "number" && !Number.isFinite(Number(condition.value))) {
    return "Enter a finite number.";
  }
  return null;
}

export function consoleFilterValueLabel(
  field: ConsoleFilterField,
  condition: ConsoleFilterCondition
) {
  if (condition.operator === "between") {
    return `${condition.value[0]} and ${condition.value[1]}`;
  }
  return field.kind === "enum"
    ? (field.options.find((option) => option.value === condition.value)
        ?.label ?? condition.value)
    : condition.value;
}

export interface ConsoleFilterGroup {
  id: string;
  operator: "and" | "or";
  children: readonly ConsoleFilterNode[];
}

export type ConsoleFilterNode = ConsoleFilterCondition | ConsoleFilterGroup;

export const consoleFilterLimits = { depth: 4, nodes: 50 } as const;

export function isConsoleFilterGroup(
  node: ConsoleFilterNode
): node is ConsoleFilterGroup {
  return "children" in node;
}

/** Complex Boolean expressions need the editor, not a misleading flattened label. */
export function summarizeConsoleFilters(
  fields: readonly ConsoleFilterField[],
  group: ConsoleFilterGroup
): string {
  function count(node: ConsoleFilterNode): number {
    return isConsoleFilterGroup(node)
      ? node.children.reduce((total, child) => total + count(child), 0)
      : 1;
  }
  const total = count(group);
  if (!total) {
    return "Filters";
  }
  const only = group.children.length === 1 ? group.children[0] : undefined;
  if (only && !isConsoleFilterGroup(only)) {
    const field = fields.find((item) => item.id === only.field);
    if (field && !validateConsoleFilter(field, only)) {
      const value = consoleFilterValueLabel(field, only);
      return field.kind === "enum"
        ? `${field.label}: ${value}`
        : `${field.label} ${consoleFilterOperatorLabels[only.operator]} ${value}`;
    }
  }
  return `Custom filters · ${total} ${total === 1 ? "condition" : "conditions"}`;
}

export function isConsoleFilterDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Empty editing groups contribute no predicate, including inside an OR group. */
export function consoleFilterHasConditions(node: ConsoleFilterNode): boolean {
  return (
    !isConsoleFilterGroup(node) ||
    node.children.some(consoleFilterHasConditions)
  );
}

export function evaluateConsoleFilter(
  node: ConsoleFilterNode,
  matches: (condition: ConsoleFilterCondition) => boolean
): boolean {
  if (!isConsoleFilterGroup(node)) {
    return matches(node);
  }
  const children = node.children.filter(consoleFilterHasConditions);
  return (
    children.length === 0 ||
    (node.operator === "and"
      ? children.every((child) => evaluateConsoleFilter(child, matches))
      : children.some((child) => evaluateConsoleFilter(child, matches)))
  );
}

/** Inclusive calendar range; before/after exclude the selected calendar day. */
export function matchesConsoleFilterDate(
  value: string,
  condition: ConsoleFilterCondition
): boolean {
  if (!isConsoleFilterDate(value)) {
    return false;
  }
  if (condition.operator === "between") {
    return (
      isConsoleFilterDate(condition.value[0]) &&
      isConsoleFilterDate(condition.value[1]) &&
      value >= condition.value[0] &&
      value <= condition.value[1]
    );
  }
  if (!isConsoleFilterDate(condition.value)) {
    return false;
  }
  switch (condition.operator) {
    case "on": {
      return value === condition.value;
    }
    case "before": {
      return value < condition.value;
    }
    case "after": {
      return value > condition.value;
    }
    default: {
      return false;
    }
  }
}

export function validateConsoleFilterGroup(
  fields: readonly ConsoleFilterField[],
  group: ConsoleFilterGroup
): string | null {
  const ids = new Set<string>();
  let count = 0;
  function visit(node: ConsoleFilterNode, depth: number): string | null {
    count += 1;
    if (
      count > consoleFilterLimits.nodes ||
      depth > consoleFilterLimits.depth
    ) {
      return "Use at most 50 nodes and four group levels.";
    }
    if (!node.id || ids.has(node.id)) {
      return "Each filter node needs a unique ID.";
    }
    ids.add(node.id);
    if (!isConsoleFilterGroup(node)) {
      return validateConsoleFilter(
        fields.find((field) => field.id === node.field),
        node
      );
    }
    if (node.operator !== "and" && node.operator !== "or") {
      return "Choose AND or OR.";
    }
    for (const child of node.children) {
      const error = visit(child, depth + (isConsoleFilterGroup(child) ? 1 : 0));
      if (error) {
        return error;
      }
    }
    return null;
  }
  return visit(group, 1);
}
