import { isSchemaObject, mergeSchema } from "./plugin-configuration-schema";
import type { JsonObject, JsonValue } from "./plugin-control-contract";

const schemaMaps = new Set([
  "properties",
  "patternProperties",
  "dependentSchemas",
]);
const schemaArrays = new Set(["allOf", "oneOf", "anyOf", "prefixItems"]);
const schemaValues = new Set([
  "items",
  "additionalProperties",
  "unevaluatedProperties",
  "contains",
  "propertyNames",
  "if",
  "then",
  "else",
  "not",
]);

// Expand only schema positions: a default/example may itself contain "$ref".
// Unresolvable references stay intact so the editor falls back to Advanced.
export function expandConfigurationReferences(root: JsonObject): JsonObject {
  let remaining = 2048;
  function expand(
    schema: JsonObject,
    ancestors: Set<JsonObject>,
    depth: number
  ): JsonObject {
    remaining -= 1;
    if (
      remaining < 0 ||
      depth > 24 ||
      ancestors.has(schema) ||
      (schema !== root && "$id" in schema)
    ) {
      return { $ref: "#unsupported" };
    }
    const next = new Set(ancestors).add(schema);
    const entries = Object.entries(schema).map(
      ([key, value]): [string, JsonValue] => {
        if (schemaMaps.has(key) && isSchemaObject(value)) {
          return [
            key,
            Object.fromEntries(
              Object.entries(value).map(([name, child]) => [
                name,
                isSchemaObject(child) ? expand(child, next, depth + 1) : child,
              ])
            ),
          ];
        }
        if (schemaArrays.has(key) && Array.isArray(value)) {
          return [
            key,
            value.map((child) =>
              isSchemaObject(child) ? expand(child, next, depth + 1) : child
            ),
          ];
        }
        if (schemaValues.has(key) && isSchemaObject(value)) {
          return [key, expand(value, next, depth + 1)];
        }
        return [key, value];
      }
    );
    const expanded = Object.fromEntries(entries);
    if (!("$ref" in schema)) {
      return expanded;
    }
    const target = localReference(root, schema.$ref);
    if (!target) {
      return expanded;
    }
    const siblings = Object.fromEntries(
      entries.filter(([key]) => key !== "$ref")
    );
    const expandedTarget = expand(target, next, depth + 1);
    return (
      mergeSchema(expandedTarget, siblings) ?? {
        allOf: [expandedTarget, siblings],
      }
    );
  }
  return expand(root, new Set(), 0);
}

function localReference(
  root: JsonObject,
  reference: JsonValue
): JsonObject | null {
  if (typeof reference !== "string" || !reference.startsWith("#")) {
    return null;
  }
  let pointer: string;
  try {
    pointer = decodeURIComponent(reference.slice(1));
  } catch {
    return null;
  }
  if (pointer === "") {
    return root;
  }
  if (!pointer.startsWith("/")) {
    return null;
  }
  let target: JsonValue | undefined = root;
  for (const part of pointer.slice(1).split("/")) {
    if (/~[^01]|~$/u.test(part)) {
      return null;
    }
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (
      !isSchemaObject(target) ||
      !Object.hasOwn(target, key) ||
      (target !== root && "$id" in target)
    ) {
      return null;
    }
    target = target[key];
  }
  return isSchemaObject(target) ? target : null;
}
