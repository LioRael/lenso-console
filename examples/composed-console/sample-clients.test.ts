import { expect, test } from "bun:test";

import {
  createSampleAuth,
  createSampleDashboard,
  createSampleOrders,
} from "./sample-clients";

test("sample Dashboard isolates snapshots and rejects stale writes", async () => {
  const store = createSampleDashboard();
  const first = await store.read();
  first.document.instances.length = 0;
  const unchanged = await store.read();
  expect(unchanged.document.instances).toHaveLength(1);
  const saved = await store.save({
    expectedRevision: first.revision,
    mutationId: "sample-edit",
    document: first.document,
  });
  expect(saved.document.instances).toHaveLength(0);
  await expect(
    store.save({
      expectedRevision: first.revision,
      mutationId: "stale-edit",
      document: first.document,
    })
  ).rejects.toThrow("revision conflict");
});

test("sample revocation is revision checked and isolated between Auth clients", async () => {
  const workforce = createSampleAuth("workforce");
  const customers = createSampleAuth("customers");
  const initial = await workforce.listSessionPage!({});
  const first = initial.sessions[0]!;
  await expect(
    workforce.revokeSession!(first.id, { expectedRevision: 0 })
  ).rejects.toThrow("revision conflict");
  await workforce.revokeSession!(first.id, {
    expectedRevision: first.revision!,
  });
  const revoked = await workforce.readSession!(first.id);
  const customerPage = await customers.listSessionPage!({});
  expect(revoked?.revokedAt).toBeNumber();
  expect(customerPage.sessions[0]?.revokedAt).toBeUndefined();
  const page = await workforce.listSessionPage!({ cursor: "2" });
  expect(page.sessions).toHaveLength(1);
  expect(page.nextCursor).toBeNull();
});

test("sample archive changes the selected orders only and aborted writes are inert", async () => {
  const orders = createSampleOrders();
  const options = { signal: new AbortController().signal };
  await orders.archive({ ids: ["sample-order-1"] }, options);
  const archived = await orders.list(options);
  expect(archived.map((row) => row.status)).toEqual([
    "Sample: archived",
    "Sample: ready",
    "Sample: ready",
  ]);
  await expect(
    orders.archive({ ids: ["sample-order-2"] }, { signal: AbortSignal.abort() })
  ).rejects.toThrow();
  const unchanged = await orders.list(options);
  expect(unchanged[1]?.status).toBe("Sample: ready");
});
