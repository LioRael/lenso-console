import { test, expect } from "bun:test";

import type { InvocationContext } from "../../console-sdk/src/generated/workspace-service";
import {
  createWorkspaceServices,
  defineServices,
  operation,
} from "../../console-sdk/src/server";

test("service adapters enforce validation and authorization before domain code", async () => {
  let calls = 0;
  const services = defineServices({
    orders: {
      capabilityId: "example.orders.query@1",
      version: "1.0.0",
      operations: {
        read: operation({
          parse(value: unknown) {
            if (typeof value !== "string") {
              throw new TypeError("string required");
            }
            return value;
          },
          authorize(_context, value) {
            return value === "42";
          },
          handle(value) {
            calls += 1;
            return { id: value };
          },
        }),
      },
    },
  });
  const adapter = createWorkspaceServices(services, "test");
  const invoke = (value: unknown) =>
    adapter.provider.invoke({} as InvocationContext, {
      service_id: "orders",
      operation: "read",
      media_type: "application/json",
      body_base64: Buffer.from(JSON.stringify(value)).toString("base64"),
    });
  const invalid = await invoke(42);
  const denied = await invoke("99");
  expect(invalid.ok).toBe(false);
  expect(denied.ok).toBe(false);
  expect(calls).toBe(0);
  const response = await invoke("42");
  expect(response.ok).toBe(true);
  expect(calls).toBe(1);
  expect(adapter.requirements[0]?.source).toBe("owner");
});
