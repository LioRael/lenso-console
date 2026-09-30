import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const deployment = "ops-test";
const operation = "operation-1";
const base = {
  binding_digest: "binding-digest",
  digest: "intent-digest",
  entry_id: "change-state",
  execution_until_ms: null,
  expires_at: "2099-01-01T00:00:00Z",
  parameters: { expected_revision: "1", input: { value: 61 } },
  response: {
    audit_pending: true,
    operation_id: operation,
    receipt: null,
    result_json: null,
    state: "pending_approval",
  },
  subject: "alice",
};
const event = (phase, state, receipt = null) => ({
  actor: null,
  decision: null,
  intent: {
    deployment,
    digest: base.digest,
    entry_id: base.entry_id,
    expires_at: base.expires_at,
    operation_id: operation,
    subject: "alice",
  },
  occurred_at: "2026-09-30T00:00:00Z",
  phase,
  receipt,
  state,
});
const instantiate = (persist) =>
  new Miniflare(
    convertV4MiniflareOptions({
      resourcePersistencePath: persist,
      workers: [
        {
          compatibilityDate: "2026-09-30",
          d1Databases: { DB: "management-test" },
          modules: [
            {
              type: "ESModule",
              path: fileURLToPath(
                new URL("journal-fixture.worker.mjs", import.meta.url)
              ),
            },
            {
              type: "ESModule",
              path: fileURLToPath(
                new URL(
                  "../crates/lenso-management-core/src/workers/journal.mjs",
                  import.meta.url
                )
              ),
            },
          ],
          modulesRoot: fileURLToPath(new URL("../", import.meta.url)),
          name: "management-journal",
        },
      ],
    })
  );
async function call(runtime, input) {
  const response = await runtime.dispatchFetch("http://localhost/test", {
    body: JSON.stringify(input),
    method: "POST",
  });
  assert.equal(response.status, 200);
  return response.json();
}
const field = async (runtime, input, path) => {
  const reply = await call(runtime, input);
  return path.split(".").reduce((value, key) => value[key], reply);
};
const action = (name, extra = {}) => ({
  action: name,
  deployment,
  operation_id: operation,
  ...extra,
});

test("real D1 durable claim, restart, monotonic receipt and audit repair", async () => {
  const directory = await mkdtemp(join(tmpdir(), "management-d1-journal-"));
  let runtime = instantiate(directory);
  try {
    assert.deepEqual(await call(runtime, { action: "inspect" }), {
      error: "unavailable",
    });
    await call(runtime, { operator: "setup" });
    assert.deepEqual(await call(runtime, { action: "inspect" }), {
      kind: "ready",
    });
    assert.deepEqual(
      await call(runtime, {
        action: "qualifies",
        deployment,
        subject: "alice",
      }),
      { qualified: false }
    );
    await call(runtime, { deployment, operator: "grant", subject: "alice" });
    assert.deepEqual(
      await call(runtime, {
        action: "qualifies",
        deployment,
        subject: "alice",
      }),
      { qualified: true }
    );
    const reserved = await call(runtime, {
      action: "reserve",
      deployment,
      key: "request-1",
      record: base,
    });
    assert.equal(reserved.value.digest, base.digest);
    const changed = await call(runtime, {
      action: "reserve",
      deployment,
      key: "request-1",
      record: {
        ...base,
        digest: "changed",
        expires_at: "2099-02-01T00:00:00Z",
      },
    });
    assert.equal(changed.value.digest, base.digest);
    assert.equal(changed.value.expires_at, base.expires_at);
    await call(
      runtime,
      action("enqueue", { event: event("attempt", "pending_approval") })
    );
    const executing = { ...base.response, state: "executing" };
    const until = Date.now() + 2000;
    const claims = await Promise.all([
      call(
        runtime,
        action("claim", { execution_until_ms: until, response: executing })
      ),
      call(
        runtime,
        action("claim", { execution_until_ms: until, response: executing })
      ),
    ]);
    assert.deepEqual(claims.map((reply) => reply.value).sort(), [false, true]);
    await runtime.dispose();
    runtime = instantiate(directory);
    assert.equal(
      await field(runtime, action("load"), "value.response.state"),
      "executing"
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, until - Date.now() + 10))
    );
    const recovery = action("recover", {
      event: event("interrupted", "unknown"),
      execution_until_ms: until,
      now_ms: Date.now(),
    });
    assert.equal(
      await field(runtime, recovery, "value.response.state"),
      "unknown"
    );
    const success = {
      ...base.response,
      receipt: "state:2",
      result_json: '{"value":61,"revision":2}',
      state: "succeeded",
    };
    // Original event's late completion must not erase the durable Unknown boundary.
    await call(
      runtime,
      action("complete", {
        event: event("completed", "succeeded", "state:2"),
        response: success,
      })
    );
    assert.equal(
      await field(runtime, action("load"), "value.response.state"),
      "unknown"
    );
    await call(
      runtime,
      action("complete", {
        event: event("reconciled", "succeeded", "state:2"),
        response: success,
      })
    );
    const after = await call(runtime, action("load"));
    assert.equal(after.value.response.receipt, "state:2");
    await call(
      runtime,
      action("complete", {
        event: event("completed", "unknown"),
        response: { ...executing, state: "unknown" },
      })
    );
    assert.equal(
      await field(runtime, action("load"), "value.response.state"),
      "succeeded"
    );
    const pending = await call(runtime, action("pending_events"));
    assert.deepEqual(
      pending.value.map((item) => item.phase),
      ["attempt", "interrupted", "reconciled"]
    );
    await call(runtime, action("acknowledge", { phase: "attempt" }));
    await call(runtime, action("refresh_audit"));
    assert.equal(
      await field(runtime, action("load"), "value.response.audit_pending"),
      true
    );
    await call(runtime, action("acknowledge", { phase: "interrupted" }));
    await call(runtime, action("acknowledge", { phase: "reconciled" }));
    await call(runtime, action("refresh_audit"));
    assert.equal(
      await field(runtime, action("load"), "value.response.audit_pending"),
      false
    );
    for (const fault of ["missing", "failed", "oversized"]) {
      const operationId = `uncertain-${fault}`;
      const record = {
        ...base,
        response: { ...base.response, operation_id: operationId },
      };
      await call(runtime, {
        action: "reserve",
        deployment,
        key: operationId,
        record,
      });
      const claim = await call(runtime, {
        action: "claim",
        deployment,
        execution_until_ms: Date.now() + 5000,
        operation_id: operationId,
        receipt_fault: fault,
        response: { ...record.response, state: "executing" },
      });
      assert.deepEqual(claim, { error: "unavailable" });
      assert.equal(
        await field(
          runtime,
          {
            action: "load",
            deployment,
            operation_id: operationId,
          },
          "value.response.state"
        ),
        "executing"
      );
      const completion = await call(runtime, {
        action: "complete",
        deployment,
        event: {
          ...event("completed", "succeeded", "confirmed"),
          intent: {
            ...event("completed", "succeeded").intent,
            operation_id: operationId,
          },
        },
        operation_id: operationId,
        receipt_fault: fault,
        response: {
          ...record.response,
          receipt: "confirmed",
          state: "succeeded",
        },
      });
      assert.deepEqual(completion, { error: "unavailable" });
      const committed = await field(
        runtime,
        {
          action: "load",
          deployment,
          operation_id: operationId,
        },
        "value"
      );
      assert.equal(committed.response.state, "succeeded");
      assert.equal(committed.response.receipt, "confirmed");
    }
    await call(runtime, { deployment, operator: "revoke", subject: "alice" });
    assert.deepEqual(
      await call(runtime, {
        action: "qualifies",
        deployment,
        subject: "alice",
      }),
      { qualified: false }
    );
    assert.equal(
      await field(runtime, action("load", { deployment: "another" }), "error"),
      "not_found"
    );
  } finally {
    await runtime.dispose();
    await rm(directory, { force: true, recursive: true });
  }
});
