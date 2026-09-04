import { expect, test } from "vitest";

import { expandConfigurationReferences } from "./configuration-schema-references";
import { resolveConfigurationSchema } from "./plugin-configuration-schema";

test("expands local pointers without interpreting example data as schemas", () => {
  const expanded = expandConfigurationReferences({
    $defs: { "a/b": { type: "string", writeOnly: true } },
    properties: { token: { $ref: "#/$defs/a~1b", title: "Token" } },
    default: { $ref: "not a schema" },
  });
  expect(expanded.properties).toEqual({
    token: { type: "string", writeOnly: true, title: "Token" },
  });
  expect(expanded.default).toEqual({ $ref: "not a schema" });
});

test("keeps unsafe, missing and cyclic references in Advanced", () => {
  for (const reference of [
    "https://example.com/schema",
    "#/missing",
    "#",
    "#/%ZZ",
    "#/$defs/cycle",
  ]) {
    const schema = expandConfigurationReferences({
      $defs: { cycle: { $ref: "#/$defs/cycle" } },
      $ref: reference,
    });
    expect(resolveConfigurationSchema(schema, {})).toBeNull();
  }
});

test("does not resolve a pointer across a nested resource boundary", () => {
  const schema = expandConfigurationReferences({
    $defs: {
      nested: { $id: "other.json", properties: { name: { type: "string" } } },
    },
    $ref: "#/$defs/nested/properties/name",
  });
  expect(resolveConfigurationSchema(schema, "")).toBeNull();
});

test("exposes only a nullable schema's concrete type and keeps ambiguous unions unsupported", () => {
  for (const schema of [
    { type: ["string", "null"] },
    { anyOf: [{ type: "string" }, { type: "null" }] },
    { oneOf: [{ type: "null" }, { type: "string" }] },
  ]) {
    expect(resolveConfigurationSchema(schema, undefined)?.type).toBe("string");
  }
  expect(
    resolveConfigurationSchema(
      { oneOf: [{ type: "string" }, { type: "number" }] },
      ""
    )
  ).toBeNull();
});
