import type { JsonObject, JsonValue } from "./plugin-control-contract";

const annotations = new Set([
  "title",
  "description",
  "default",
  "examples",
  "$comment",
]);
const unsupported = [
  "$ref",
  "$dynamicRef",
  "oneOf",
  "anyOf",
  "not",
  "dependentSchemas",
  "dependencies",
  "patternProperties",
  "unevaluatedProperties",
];

export function isSchemaObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Presentation only. The configuration authority still validates every proposal.
// Unknown condition semantics must never select an arbitrary editing branch.
export function resolveConfigurationSchema(
  inputSchema: JsonObject,
  value: unknown,
  depth = 0
): JsonObject | null {
  const schema = editableNullableSchema(inputSchema);
  if (depth > 24 || unsupported.some((key) => key in schema)) {
    return null;
  }
  let resolved: JsonObject = Object.fromEntries(
    Object.entries(schema).filter(
      ([key]) => !["if", "then", "else", "allOf"].includes(key)
    )
  );
  const branches: JsonObject[] = [];
  if (schema.allOf !== undefined) {
    if (!Array.isArray(schema.allOf) || !schema.allOf.every(isSchemaObject)) {
      return null;
    }
    branches.push(...schema.allOf);
  }
  if (schema.if !== undefined) {
    const matches = matchCondition(schema.if, value, depth + 1);
    if (matches === null) {
      return null;
    }
    const branch = matches ? schema.then : schema.else;
    if (branch === false) {
      return null;
    }
    if (branch !== undefined && branch !== true) {
      if (!isSchemaObject(branch)) {
        return null;
      }
      branches.push(branch);
    }
  }
  for (const branch of branches) {
    const selected = resolveConfigurationSchema(branch, value, depth + 1);
    const merged = selected && mergeSchema(resolved, selected);
    if (!merged) {
      return null;
    }
    resolved = merged;
  }
  return resolved;
}

export function mergeSchema(
  base: JsonObject,
  branch: JsonObject
): JsonObject | null {
  const merged = { ...base };
  for (const [key, value] of Object.entries(branch)) {
    const previous = merged[key];
    if (previous === undefined || annotations.has(key)) {
      merged[key] = value;
    } else if (
      key === "required" &&
      Array.isArray(previous) &&
      Array.isArray(value)
    ) {
      merged[key] = [...new Set([...previous, ...value])];
    } else if (
      key === "properties" &&
      isSchemaObject(previous) &&
      isSchemaObject(value)
    ) {
      const properties = { ...previous };
      for (const [name, property] of Object.entries(value)) {
        const existing = properties[name];
        if (existing === undefined) {
          properties[name] = property;
        } else if (isSchemaObject(existing) && isSchemaObject(property)) {
          const combined = mergeSchema(existing, property);
          if (!combined) {
            return null;
          }
          properties[name] = combined;
        } else if (JSON.stringify(existing) !== JSON.stringify(property)) {
          return null;
        }
      }
      merged[key] = properties;
    } else if (
      (key === "readOnly" || key === "writeOnly") &&
      typeof previous === "boolean" &&
      typeof value === "boolean"
    ) {
      merged[key] = previous || value;
    } else if (JSON.stringify(previous) !== JSON.stringify(value)) {
      // Do not approximate intersections of constraints as last-write-wins.
      return null;
    }
  }
  return merged;
}

// TOML has no null literal. Expose the concrete editor, never a fake "set null"
// operation. Removing an override continues to mean inheritance, not null.
function editableNullableSchema(schema: JsonObject): JsonObject {
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const types = schema.type.filter((type) => type !== "null");
    if (types.length === 1 && typeof types[0] === "string") {
      return { ...schema, type: types[0] };
    }
  }
  for (const keyword of ["anyOf", "oneOf"] as const) {
    const branches = schema[keyword];
    if (
      !Array.isArray(branches) ||
      branches.length !== 2 ||
      !branches.every(isSchemaObject)
    ) {
      continue;
    }
    const nullBranch = branches.find(
      (branch) =>
        branch.type === "null" &&
        Object.keys(branch).every(
          (key) => key === "type" || annotations.has(key)
        )
    );
    const concrete = branches.find((branch) => branch !== nullBranch);
    if (
      nullBranch &&
      concrete &&
      typeof concrete.type === "string" &&
      concrete.type !== "null"
    ) {
      const siblings = Object.fromEntries(
        Object.entries(schema).filter(([key]) => key !== keyword)
      );
      return mergeSchema(siblings, concrete) ?? schema;
    }
  }
  return schema;
}

function matchCondition(
  schema: JsonValue,
  value: unknown,
  depth: number
): boolean | null {
  if (typeof schema === "boolean") {
    return schema;
  }
  if (depth > 24 || !isSchemaObject(schema)) {
    return null;
  }
  const allowed = new Set([
    "const",
    "enum",
    "required",
    "properties",
    "allOf",
    "anyOf",
    "not",
    ...annotations,
  ]);
  if (Object.keys(schema).some((key) => !allowed.has(key))) {
    return null;
  }
  const results: (boolean | null)[] = [];
  if ("const" in schema) {
    results.push(matchScalar(schema.const, value));
  }
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum)) {
      return null;
    }
    const options = new Set(
      schema.enum.map((option) => matchScalar(option, value))
    );
    results.push(options.has(null) ? null : options.has(true));
  }
  if (schema.required !== undefined) {
    if (
      !Array.isArray(schema.required) ||
      !schema.required.every((key) => typeof key === "string")
    ) {
      return null;
    }
    results.push(
      !isSchemaObject(value) ||
        schema.required.every((key) => Object.hasOwn(value, key as string))
    );
  }
  if (schema.properties !== undefined) {
    if (!isSchemaObject(schema.properties)) {
      return null;
    }
    for (const [key, property] of Object.entries(schema.properties)) {
      if (isSchemaObject(value) && Object.hasOwn(value, key)) {
        results.push(matchCondition(property, value[key], depth + 1));
      }
    }
  }
  for (const key of ["allOf", "anyOf"] as const) {
    const branches = schema[key];
    if (branches !== undefined) {
      if (!Array.isArray(branches)) {
        return null;
      }
      const matches = branches.map((branch) =>
        matchCondition(branch, value, depth + 1)
      );
      results.push(
        matches.includes(null)
          ? null
          : key === "allOf"
            ? matches.every(Boolean)
            : matches.some(Boolean)
      );
    }
  }
  if (schema.not !== undefined) {
    const match = matchCondition(schema.not, value, depth + 1);
    results.push(match === null ? null : !match);
  }
  return results.includes(null) ? null : results.every(Boolean);
}

function matchScalar(
  expected: JsonValue | undefined,
  actual: unknown
): boolean | null {
  return expected !== null && typeof expected === "object"
    ? null
    : expected === actual;
}
