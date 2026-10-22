import { expect, test } from "bun:test";

import { createAuditClient } from "../src/client";
// Prevents accidental tenant/filter injection and raw audit disclosure at the browser boundary.
test("audit adapter rejects scope input and projects metadata only", async () => {
  const id = crypto.randomUUID();
  const { signal } = new AbortController();
  let calls = 0;
  const event = {
    id,
    recordedAt: 1,
    occurredAt: 1,
    action: "doc.write",
    target: { type: "doc", id: "1" },
    result: "unknown",
    reasonCode: "unconfirmed",
    raw: "secret",
    summary: { secret: "payload" },
    actor: { token: "secret" },
  };
  const client = createAuditClient({
    service: "scoped",
    async invoke(service, method, input, received) {
      calls += 1;
      expect(service).toBe("scoped");
      expect(received).toBe(signal);
      return method === "query" ? { events: [event], nextCursor: null } : event;
    },
  });
  await expect(
    client.query({ scope: "other" } as never, signal)
  ).rejects.toBeDefined();
  expect(calls).toBe(0);
  const page = await client.query({}, signal);
  expect(page.events[0]).not.toHaveProperty("raw");
  expect(page.events[0]).not.toHaveProperty("summary");
  expect(page.events[0]).not.toHaveProperty("actor");
  await expect(client.get(crypto.randomUUID(), signal)).rejects.toBeDefined();
});
