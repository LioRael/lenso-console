import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";

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
test("standalone official SDK owner bundle executes in actual workerd", async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          compatibilityDate: "2026-09-30",
          modules: [
            {
              type: "ESModule",
              path: fileURLToPath(
                new URL("mcp-fixture.worker.mjs", import.meta.url)
              ),
            },
            {
              type: "ESModule",
              path: fileURLToPath(
                new URL(
                  "../crates/lenso-management-http/src/workers/mcp.mjs",
                  import.meta.url
                )
              ),
            },
          ],
          modulesRoot: fileURLToPath(new URL("../", import.meta.url)),
          name: "mcp-owner",
        },
      ],
    })
  );
  const send = async (input) => {
    const reply = await runtime.dispatchFetch("http://localhost/fixture", {
      body: JSON.stringify(input),
      method: "POST",
    });
    return reply.json();
  };
  try {
    const listing = decode(await send(packet("tools/list")));
    assert.equal(listing.result.tools.length, 1);
    assert.equal(listing.result.tools[0].annotations.readOnlyHint, true);
    const executed = decode(
      await send(
        packet("tools/call", {
          arguments: {
            expected_revision: null,
            idempotency_key: null,
            input: {},
          },
          name: listing.result.tools[0].name,
        })
      )
    );
    assert.equal(executed.result.isError, false);
    assert.equal(
      JSON.parse(executed.result.content[0].text).state,
      "succeeded"
    );
  } finally {
    await runtime.dispose();
  }
});
