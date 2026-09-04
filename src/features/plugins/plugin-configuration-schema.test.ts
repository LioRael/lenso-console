import { expect, test } from "vitest";

import {
  mergeSchema,
  resolveConfigurationSchema,
} from "./plugin-configuration-schema";

test("intersects unrestricted properties without discarding constraints", () => {
  const typed = { properties: { value: { type: "string", writeOnly: true } } };
  const unrestricted = { properties: { value: true } };
  expect(mergeSchema(unrestricted, typed)).toEqual(typed);
  expect(mergeSchema(typed, unrestricted)).toEqual(typed);
  expect(mergeSchema(unrestricted, { properties: { value: false } })).toEqual({
    properties: { value: false },
  });
  expect(mergeSchema(typed, { properties: { value: false } })).toBeNull();
});

test("resolves only the active conditional properties of a closed object", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { enum: ["local", "remote"] },
      path: true,
      endpoint: true,
    },
    if: { properties: { mode: { const: "local" } }, required: ["mode"] },
    // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema conditional keyword, not a Promise.
    then: { properties: { path: { type: "string" } }, required: ["path"] },
    else: {
      properties: { endpoint: { type: "string" } },
      required: ["endpoint"],
    },
  };
  expect(resolveConfigurationSchema(schema, { mode: "local" })).toMatchObject({
    additionalProperties: false,
    required: ["path"],
    properties: { path: { type: "string" }, endpoint: true },
  });
  expect(resolveConfigurationSchema(schema, { mode: "remote" })).toMatchObject({
    additionalProperties: false,
    required: ["endpoint"],
    properties: { path: true, endpoint: { type: "string" } },
  });
});
