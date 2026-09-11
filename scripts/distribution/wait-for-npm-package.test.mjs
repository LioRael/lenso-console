import assert from "node:assert/strict";
import { test } from "node:test";

import { waitForPackage } from "./wait-for-npm-package.mjs";

const expected = {
  integrity: "sha512-verified",
  name: "@lenso/agent",
  version: "1.16.0",
};
const published = () =>
  Response.json({
    ...expected,
    dist: {
      integrity: expected.integrity,
      tarball: "https://registry.npmjs.org/@lenso/agent/-/agent-1.16.0.tgz",
    },
  });
const harness = (responses) => {
  let time = 0;
  const requests = [];
  return {
    options: {
      fetch: (url, options) => {
        requests.push({ method: options.method ?? "GET", url });
        return responses.shift();
      },
      intervalMs: 10,
      now: () => time,
      sleep: (ms) => {
        time += ms;
      },
      timeoutMs: 40,
    },
    requests,
  };
};

test("waits through withheld metadata and tarball before declaring readiness", async () => {
  const fixture = harness([
    new Response(null, { status: 404 }),
    published(),
    new Response(null, { status: 404 }),
    published(),
    new Response(null, { status: 200 }),
  ]);
  await waitForPackage(expected, fixture.options);
  assert.equal(fixture.requests.length, 5);
  assert.equal(fixture.requests.at(-1).method, "HEAD");
});

test("a different published archive fails without accepting a same-version replacement", async () => {
  const fixture = harness([
    Response.json({ ...expected, dist: { integrity: "sha512-other" } }),
  ]);
  await assert.rejects(
    waitForPackage(expected, fixture.options),
    /differs from the verified archive/u
  );
});

test("registry errors are not mistaken for pending publication", async () => {
  const fixture = harness([new Response(null, { status: 403 })]);
  await assert.rejects(
    waitForPackage(expected, fixture.options),
    /Registry check failed \(403\)/u
  );
});

test("withheld publication has a bounded deadline", async () => {
  const fixture = harness(
    Array.from({ length: 4 }, () => new Response(null, { status: 404 }))
  );
  await assert.rejects(
    waitForPackage(expected, fixture.options),
    /not publicly installable/u
  );
  assert.equal(fixture.requests.length, 4);
});

test("unexpected tarball origins fail before any external request", async () => {
  const fixture = harness([
    Response.json({
      ...expected,
      dist: {
        integrity: expected.integrity,
        tarball: "https://example.test/package.tgz",
      },
    }),
  ]);
  await assert.rejects(
    waitForPackage(expected, fixture.options),
    /Unexpected registry tarball origin/u
  );
  assert.equal(fixture.requests.length, 1);
});
