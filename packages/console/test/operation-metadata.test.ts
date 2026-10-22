import { expect, test } from "bun:test";

import { defineOperation, describeOperation } from "@lenso/engine/operations";
import { z } from "zod";

import { projectOperationMetadata } from "../src/operation-metadata";

const plugin = { id: "inspection", setup: () => ({ read: () => null }) };
const operation = defineOperation({
  plugin,
  method: "read",
  input: z.object({}),
  effect: "read",
  description: "Inspect",
  retry: "safe",
  cancellation: "cooperative",
});

test("metadata permits inert relative source references and rejects local paths, URLs and traversal", () => {
  const entry = describeOperation(operation, "");
  const declaredContracts = Object.hasOwn(entry, "outputSchemaAvailability");
  for (const file of [
    "/Users/alice/private.ts",
    "https://example.test/file.ts?key=secret",
    "../secret",
    "src/../private.ts",
    "C:\\private.ts",
    "src//file.ts",
  ]) {
    expect(
      projectOperationMetadata({ ...entry, source: { file } }).source
    ).toBeNull();
  }
  expect(
    projectOperationMetadata({
      ...entry,
      source: { file: "src/read.ts", export: "read", line: 8 },
    })
  ).toMatchObject({
    source: { file: "src/read.ts", export: "read", line: 8 },
    retry: "safe",
    cancellation: "cooperative",
    outputContract: {
      availability: declaredContracts ? "not-declared" : "unavailable",
    },
    errorContract: declaredContracts
      ? { availability: "declared", errors: [] }
      : { availability: "unavailable" },
  });
});

test("metadata excludes exception-like extras and environment secrets", () => {
  const previous = process.env.LENSO_CONSOLE_METADATA_TEST_SECRET;
  process.env.LENSO_CONSOLE_METADATA_TEST_SECRET = "synthetic-private-value";
  try {
    const declaration = {
      ...describeOperation(operation, ""),
      source: { file: "src/synthetic-private-value.ts" },
      outputDescription: "Description with synthetic-private-value",
      details: { password: "synthetic-private-value" },
    };
    const metadata = projectOperationMetadata(declaration);
    expect(metadata.source).toBeNull();
    expect(metadata.outputDescription).toContain("[REDACTED]");
    expect(JSON.stringify(metadata)).not.toContain("synthetic-private-value");
    expect(Object.hasOwn(metadata, "details")).toBe(false);
  } finally {
    if (previous === undefined) {
      delete process.env.LENSO_CONSOLE_METADATA_TEST_SECRET;
    } else {
      process.env.LENSO_CONSOLE_METADATA_TEST_SECRET = previous;
    }
  }
});

test("additive output and error contracts remain declarations and strip schema payload annotations", () => {
  const metadata = projectOperationMetadata({
    outputSchemaAvailability: "available",
    outputSchema: {
      type: "object",
      properties: { total: { type: "number", default: 123, examples: [456] } },
    },
    errors: [{ code: "orders_unavailable", message: "Orders unavailable" }],
  });
  expect(metadata.outputContract).toEqual({
    availability: "available",
    schema: { type: "object", properties: { total: { type: "number" } } },
  });
  expect(metadata.errorContract).toEqual({
    availability: "declared",
    errors: [{ code: "orders_unavailable", message: "Orders unavailable" }],
  });
});

test("selection snapshots output/error contracts and rejects a substituted output validator", async () => {
  const { snapshotOperation, isSelectedOperation } =
    await import("../src/operation-selection");
  const errors = [
    { code: "orders_unavailable", message: "Orders unavailable" },
  ];
  const declaration = {
    ...operation,
    output: z.object({ total: z.number() }),
    errors,
  };
  const snapshot = snapshotOperation(declaration) as typeof declaration;
  errors[0]!.message = "Changed after admission";
  expect(snapshot.errors[0]!.message).toBe("Orders unavailable");
  const equivalent = {
    ...snapshot,
    errors: [{ code: "orders_unavailable", message: "Orders unavailable" }],
  };
  expect(isSelectedOperation([snapshot], equivalent)).toBe(true);
  const substituted = { ...equivalent, output: z.string() };
  expect(isSelectedOperation([snapshot], substituted)).toBe(false);
  const changedError = {
    ...equivalent,
    errors: [{ code: "orders_unavailable", message: "Different contract" }],
  };
  expect(isSelectedOperation([snapshot], changedError)).toBe(false);
});
