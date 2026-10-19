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
    outputContract: { availability: "unavailable" },
    errorContract: { availability: "unavailable" },
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
