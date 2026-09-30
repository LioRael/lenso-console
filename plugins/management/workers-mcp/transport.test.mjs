import assert from "node:assert/strict";
import test from "node:test";

import { alias, create } from "./transport.mjs";

const entry = {
  capability: "example.ops-state@2",
  description: "Read selected state",
  effect: "read",
  id: "state.read",
  input_schema_json:
    '{"type":"object","additionalProperties":false,"properties":{}}',
  operation: "read",
  requires_approval: false,
  target_instance: "example.ops-state/primary",
  version: "2.0.0",
};
const packet = (method, params = {}) => ({
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  headers: [
    ["content-type", "application/json"],
    ["accept", "application/json,text/event-stream"],
    ["mcp-protocol-version", "2025-11-25"],
  ],
  method: "POST",
  url: "https://example.test/mcp",
});
const decode = (reply) =>
  JSON.parse(
    reply.body.startsWith("event:")
      ? reply.body.split("data: ")[1].trim()
      : reply.body
  );

test("official stateless SDK serves current tools and denies stale executable aliases", async () => {
  const transport = create(
    null,
    { run: (work) => work() },
    { profile: "read-only" }
  );
  let selected = entry;
  let invocations = 0;
  const dispatch = async ({ action, request }) => {
    if (action === "catalog") {
      return { entries: [selected] };
    }
    if (action === "invoke") {
      invocations += 1;
      assert.equal(request.entry_id, selected.id);
      return { result_json: '{"value":47}', state: "succeeded" };
    }
    throw new Error("unexpected_action");
  };
  const listing = decode(
    await transport.handle(packet("tools/list"), dispatch)
  );
  assert.equal(listing.result.tools.length, 1);
  const [tool] = listing.result.tools;
  const { name } = tool;
  assert.equal(name.length, 60);
  assert.equal(tool.annotations.readOnlyHint, true);
  const args = { expected_revision: null, idempotency_key: null, input: {} };
  const call = decode(
    await transport.handle(
      packet("tools/call", { arguments: args, name }),
      dispatch
    )
  );
  assert.equal(call.result.isError, false);
  assert.equal(invocations, 1);
  // This catalog can change after tools/list; identity includes the selected target.
  selected = { ...entry, target_instance: "example.ops-state/secondary" };
  const old = decode(
    await transport.handle(
      packet("tools/call", { arguments: args, name }),
      dispatch
    )
  );
  assert.ok(old.error || old.result?.isError);
  assert.equal(invocations, 1);
  const fresh = decode(await transport.handle(packet("tools/list"), dispatch));
  assert.notEqual(fresh.result.tools[0].name, name);
  const reordered = {
    ...entry,
    input_schema_json:
      '{"properties":{},"additionalProperties":false,"type":"object"}',
  };
  assert.equal(await alias(entry), await alias(reordered));
  await assert.rejects(alias({ ...entry, input_schema_json: "invalid" }));
  const invalid = decode(
    await transport.handle(
      packet("tools/call", {
        arguments: { ...args, target_instance: "forged" },
        name: fresh.result.tools[0].name,
      }),
      dispatch
    )
  );
  assert.ok(invalid.error || invalid.result?.isError);
  assert.equal(invocations, 1);
});
