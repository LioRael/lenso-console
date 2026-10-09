import { test } from "bun:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { promisify } from "node:util";

import { backendProxy } from "../../packages/console-authoring/dev/proxy.mjs";

const closeServer = (server) =>
  server.listening ? promisify(server.close.bind(server))() : Promise.resolve();

// Prevent a preview proxy from silently authorizing writes or dropping Auth/CSRF.
test("backend proxy preserves authentication boundaries and rejects foreign writes", async () => {
  const requests = [];
  const backend = createServer((req, res) => {
    requests.push({ headers: req.headers, url: req.url });
    res.writeHead(403, { "set-cookie": "fixture=value; Path=/; HttpOnly" });
    res.end("backend denial");
  });
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const backendUrl = new URL(`http://127.0.0.1:${backend.address().port}`);
  const frontend = createServer((req, res) =>
    proxy(req, res, () => {
      res.writeHead(404);
      res.end();
    })
  );
  frontend.listen(0, "127.0.0.1");
  await once(frontend, "listening");
  const origin = `http://127.0.0.1:${frontend.address().port}`;
  const proxy = backendProxy(
    backendUrl,
    { api_base_path: "/realm/api", auth_base_path: "/realm/auth" },
    origin
  );
  try {
    const response = await fetch(
      `${origin}/realm/api/console/v1/pages/orders/services/orders/invoke/list`,
      {
        body: "{}",
        headers: {
          cookie: "fixture=value",
          origin,
          "x-csrf-token": "fixture-csrf",
          "x-lenso-expected-subject": "fixture-user",
          "x-lenso-page-owner": "fixture-owner",
          "x-lenso-page-revision": "fixture-revision",
        },
        method: "POST",
      }
    );
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "backend denial");
    assert.deepEqual(response.headers.getSetCookie(), [
      "fixture=value; Path=/; HttpOnly",
    ]);
    assert.equal(requests[0].headers.origin, origin);
    assert.equal(requests[0].headers.cookie, "fixture=value");
    assert.equal(requests[0].headers["x-csrf-token"], "fixture-csrf");
    assert.equal(
      requests[0].headers["x-lenso-expected-subject"],
      "fixture-user"
    );
    assert.equal(requests[0].headers["x-lenso-page-owner"], "fixture-owner");
    assert.equal(requests[0].headers.authorization, undefined);
    for (const headers of [{ origin: "https://foreign.invalid" }, {}]) {
      const denied = await fetch(`${origin}/realm/auth/password`, {
        body: "{}",
        headers,
        method: "POST",
      });
      assert.equal(denied.status, 403);
      await denied.text();
    }
    assert.equal(requests.length, 1);
    const oversized = await fetch(`${origin}/realm/api/console/v1/pages`, {
      body: "x".repeat(1024 * 1024 + 1),
      headers: { origin },
      method: "POST",
    });
    assert.equal(oversized.status, 413);
    await oversized.text();
    assert.equal(requests.length, 1);
  } finally {
    frontend.closeAllConnections();
    backend.closeAllConnections();
    await Promise.all([closeServer(frontend), closeServer(backend)]);
  }
});

test("closing preview aborts an active backend event stream", async () => {
  const backend = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: explicit fixture\n\n");
  });
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const frontend = createServer((req, res) => proxy(req, res, () => res.end()));
  frontend.listen(0, "127.0.0.1");
  await once(frontend, "listening");
  const origin = `http://127.0.0.1:${frontend.address().port}`;
  const proxy = backendProxy(
    new URL(`http://127.0.0.1:${backend.address().port}`),
    { api_base_path: "/api", auth_base_path: "/auth" },
    origin
  );
  try {
    const requested = once(backend, "request");
    const response = await fetch(`${origin}/api/events`);
    const [request] = await requested;
    const disconnected = once(request.socket, "close");
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(first.done, false);
    proxy.close();
    await assert.rejects(reader.read());
    await disconnected;
  } finally {
    proxy.close();
    frontend.closeAllConnections();
    backend.closeAllConnections();
    await Promise.all([closeServer(frontend), closeServer(backend)]);
  }
});
