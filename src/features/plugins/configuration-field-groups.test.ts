import { expect, test } from "vitest";

import { configurationFieldGroups } from "./configuration-field-groups";
import { resolveConfigurationSchema } from "./plugin-configuration-schema";

test("groups fields once using fully resolved constraints and keeps ungrouped fields", () => {
  const schema = {
    properties: {
      endpoint: { type: "string", readOnly: true },
      timeout: { type: "integer", minimum: 1 },
      extra: { type: "string" },
      inactive: true,
    },
    allOf: [
      { title: "Connection", properties: { endpoint: true, inactive: true } },
      { title: "Behavior", properties: { endpoint: true, timeout: true } },
      { title: "Empty", properties: { inactive: true } },
    ],
  };
  const groups = configurationFieldGroups(
    schema,
    resolveConfigurationSchema(schema, {})!,
    {}
  );
  expect(groups.map((group) => group.names)).toEqual([
    ["extra"],
    ["endpoint"],
    ["timeout"],
  ]);
  expect(groups[1]?.schema.properties).toEqual({
    endpoint: { type: "string", readOnly: true },
  });
  expect(groups[2]?.schema.properties).toEqual({
    timeout: { type: "integer", minimum: 1 },
  });
});

test("ordinary schemas keep their flat order", () => {
  const schema = {
    properties: { one: { type: "string" }, two: { type: "boolean" } },
  };
  expect(
    configurationFieldGroups(schema, schema, {}).map((group) => group.names)
  ).toEqual([["one", "two"]]);
});
