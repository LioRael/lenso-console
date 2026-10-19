import { expect, test } from "bun:test";

import { createConsoleOperationContextTools } from "../src/context-tools";

test("page resolver exceptions cannot leak into tool discovery, preparation or profile context", async () => {
  const tools = createConsoleOperationContextTools({
    resolve: async () => {
      throw new Error("synthetic-private-provider-value");
    },
  });
  const { signal } = new AbortController();
  for (const read of [
    () => tools.catalog({}, {}, signal),
    () =>
      tools.prepare(
        "console_page_operation_context",
        { service: "orders" },
        {},
        {},
        signal
      ),
    () => tools.context({}, {}, signal),
  ]) {
    await expect(read()).rejects.toThrow(
      "Console operation context is unavailable."
    );
  }
});
