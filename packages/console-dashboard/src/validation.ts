import type { DashboardDocument, JsonObject } from "./contract";

/** A synchronous parser must reject invalid input, not silently coerce it. */
export interface DashboardConfigSchema {
  parse(value: unknown): JsonObject;
}

export interface DashboardConfigDefinition {
  bindingId: string;
  widgetId: string;
  configVersion: number;
  configSchema: DashboardConfigSchema;
  sizes?: {
    min: { width: number; height: number };
    max: { width: number; height: number };
  };
}

export const dashboardLimits = {
  columns: 12,
  rows: 1000,
  instances: 100,
  bytes: 256 * 1024,
} as const;

export function definitionKey(ref: {
  bindingId: string;
  widgetId: string;
}): string {
  return JSON.stringify([ref.bindingId, ref.widgetId]);
}

export function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (
    typeof value === "object" &&
    value &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  throw new Error("Dashboard must contain finite JSON values");
}

export function validateDocument(document: DashboardDocument): void {
  const json = canonicalJson(document);
  if (new TextEncoder().encode(json).length > dashboardLimits.bytes) {
    throw new Error("Dashboard is too large");
  }
  if (
    document.schemaVersion !== 1 ||
    !Array.isArray(document.instances) ||
    !Array.isArray(document.placements) ||
    document.instances.length > dashboardLimits.instances
  ) {
    throw new Error("Invalid dashboard document");
  }
  const ids = new Set<string>();
  for (const instance of document.instances) {
    if (
      typeof instance.id !== "string" ||
      !instance.id ||
      instance.id.length > 128 ||
      ids.has(instance.id) ||
      typeof instance.definition?.bindingId !== "string" ||
      !instance.definition.bindingId ||
      typeof instance.definition.widgetId !== "string" ||
      !instance.definition.widgetId ||
      !Number.isSafeInteger(instance.configVersion) ||
      instance.configVersion < 1 ||
      !instance.config ||
      Array.isArray(instance.config) ||
      typeof instance.config !== "object"
    ) {
      throw new Error("Invalid or duplicate widget instance");
    }
    ids.add(instance.id);
  }
  const placed = new Set<string>();
  for (const placement of document.placements) {
    if (
      !ids.has(placement.instanceId) ||
      placed.has(placement.instanceId) ||
      ![
        placement.column,
        placement.row,
        placement.width,
        placement.height,
      ].every(Number.isSafeInteger) ||
      placement.column < 0 ||
      placement.row < 0 ||
      placement.width < 1 ||
      placement.height < 1 ||
      placement.column + placement.width > dashboardLimits.columns ||
      placement.row + placement.height > dashboardLimits.rows
    ) {
      throw new Error("Invalid widget placement");
    }
    placed.add(placement.instanceId);
  }
  if (placed.size !== ids.size) {
    throw new Error("Every widget needs one placement");
  }
  for (let index = 0; index < document.placements.length; index += 1) {
    const a = document.placements[index]!;
    for (const b of document.placements.slice(index + 1)) {
      if (
        a.column < b.column + b.width &&
        a.column + a.width > b.column &&
        a.row < b.row + b.height &&
        a.row + a.height > b.row
      ) {
        throw new Error("Widget placements cannot overlap");
      }
    }
  }
}

export function definitionMap<T extends DashboardConfigDefinition>(
  definitions: readonly T[]
): Map<string, T> {
  const map = new Map<string, T>();
  for (const definition of definitions) {
    const key = definitionKey(definition);
    if (
      !definition.bindingId ||
      !definition.widgetId ||
      !Number.isSafeInteger(definition.configVersion) ||
      definition.configVersion < 1 ||
      typeof definition.configSchema?.parse !== "function"
    ) {
      throw new Error("Invalid bound widget definition");
    }
    if (definition.sizes) {
      const { min, max } = definition.sizes;
      if (
        ![min.width, min.height, max.width, max.height].every(
          Number.isSafeInteger
        ) ||
        min.width < 1 ||
        min.height < 1 ||
        max.width < min.width ||
        max.height < min.height ||
        max.width > dashboardLimits.columns ||
        max.height > dashboardLimits.rows
      ) {
        throw new Error("Invalid widget size constraints");
      }
    }
    if (map.has(key)) {
      throw new Error("Duplicate bound widget definition");
    }
    map.set(key, definition);
  }
  return map;
}
