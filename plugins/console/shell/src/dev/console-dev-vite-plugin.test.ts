import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { consoleDevPlugin } from "./console-dev-vite-plugin";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void
) => void;

const servers = new Set<Server>();
const temporaryDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
  servers.clear();
  await Promise.all(
    [...temporaryDirectories].map((directory) =>
      rm(directory, { force: true, recursive: true })
    )
  );
  temporaryDirectories.clear();
});

describe("Console development middleware", () => {
  test("follows App backend activation without restarting the frontend and fails closed on a missing URL file", async () => {
    const first = createServer((_req, res) => res.end("first"));
    const second = createServer((_req, res) => res.end("second"));
    const firstOrigin = await listen(first);
    const secondOrigin = await listen(second);
    const directory = await mkdtemp(join(tmpdir(), "console-backend-"));
    temporaryDirectories.add(directory);
    const backendUrlFile = join(directory, "backend-url");
    await writeFile(backendUrlFile, `${firstOrigin}/\n`);
    const server = await startConsoleDevServer({
      backendUrlFile,
      hostUrl: firstOrigin,
    });
    const probe = await fetch(`${server.origin}/__lenso/backend`);
    expect(probe.status).toBe(200);
    expect(await probe.text()).toBe(`${firstOrigin}/\n`);
    expect(probe.headers.get("cache-control")).toBe("no-store");
    const read = () =>
      fetch(`${server.origin}/api/console/v1/pages`, {
        headers: { origin: server.origin },
      });
    const firstResponse = await read();
    expect(await firstResponse.text()).toBe("first");
    await writeFile(backendUrlFile, `${secondOrigin}/\n`);
    const secondResponse = await read();
    expect(await secondResponse.text()).toBe("second");
    const nextProbe = await fetch(`${server.origin}/__lenso/backend`);
    expect(await nextProbe.text()).toBe(`${secondOrigin}/\n`);
    await rm(backendUrlFile);
    const unavailable = await read();
    expect(unavailable.status).toBe(503);
  });

  test("backend readiness does not loosen browser authorization or admit unsafe URL files", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "console-backend-boundary-")
    );
    temporaryDirectories.add(directory);
    const backendUrlFile = join(directory, "backend-url");
    await writeFile(backendUrlFile, "http://127.0.0.1:3000/\n");
    const server = await startConsoleDevServer({ backendUrlFile });
    const denied = await fetch(`${server.origin}/__lenso/backend`, {
      headers: { origin: "https://untrusted.example" },
    });
    expect(denied.status).toBe(403);
    const protectedRequest = await fetch(
      `${server.origin}/api/console/v1/pages`
    );
    expect(protectedRequest.status).toBe(403);
    for (const value of [
      "http://remote.example:3000/",
      "http://user:password@127.0.0.1:3000/",
      "http://127.0.0.1:3000/path",
      " ".repeat(1025),
    ]) {
      await writeFile(backendUrlFile, value);
      const unsafe = await fetch(`${server.origin}/__lenso/backend`);
      expect(unsafe.status).toBe(503);
    }
    const target = join(directory, "target");
    await writeFile(target, "http://127.0.0.1:3000/\n");
    await rm(backendUrlFile);
    await symlink(target, backendUrlFile);
    const linked = await fetch(`${server.origin}/__lenso/backend`);
    expect(linked.status).toBe(503);
  });

  test("forwards real browser login cookies and CSRF to the selected Host", async () => {
    let forwardedHeaders: IncomingMessage["headers"] = {};
    const upstream = createServer((req, res) => {
      forwardedHeaders = req.headers;
      res.setHeader("set-cookie", [
        "__Host-lenso-session=session; Path=/; Secure; HttpOnly",
        "__Host-lenso-csrf=csrf; Path=/; Secure",
      ]);
      res.setHeader("cache-control", "no-store");
      res.end("login");
    });
    const server = await startConsoleDevServer({
      hostUrl: await listen(upstream),
    });
    const response = await fetch(`${server.origin}/auth/login`, {
      method: "POST",
      headers: {
        origin: server.origin,
        cookie: "__Host-lenso-session=prior",
        "x-csrf-token": "csrf",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(forwardedHeaders.origin).toBe(server.origin);
    expect(forwardedHeaders.cookie).toBe("__Host-lenso-session=prior");
    expect(forwardedHeaders["x-csrf-token"]).toBe("csrf");
  });
  test("preserves the subject precondition when another login replaces the browser cookie", async () => {
    let dispatchedWrites = 0;
    const forwarded: IncomingMessage["headers"][] = [];
    const upstream = createServer((req, res) => {
      forwarded.push(req.headers);
      const currentSubject =
        req.headers.cookie === "session=bob" ? "bob" : undefined;
      const expectedSubject = req.headers["x-lenso-expected-subject"];
      res.setHeader("cache-control", "no-store");
      if (expectedSubject !== currentSubject) {
        res.statusCode = 412;
        res.end("session_changed");
        return;
      }
      dispatchedWrites += 1;
      res.end("accepted");
    });
    const server = await startConsoleDevServer({
      hostUrl: await listen(upstream),
    });
    const submit = (expectedSubject: string) =>
      fetch(`${server.origin}/api/console/v1/management/tokens/issue`, {
        method: "POST",
        headers: {
          origin: server.origin,
          cookie: "session=bob",
          "x-csrf-token": "test-csrf",
          "x-lenso-expected-subject": expectedSubject,
          "content-type": "application/json",
        },
        body: "{}",
      });

    const stale = await submit("alice");
    expect(stale.status).toBe(412);
    expect(await stale.text()).toBe("session_changed");
    expect(stale.headers.get("cache-control")).toBe("no-store");
    expect(dispatchedWrites).toBe(0);
    const current = await submit("bob");
    expect(current.status).toBe(200);
    expect(await current.text()).toBe("accepted");
    expect(dispatchedWrites).toBe(1);
    expect(
      forwarded.map((headers) => headers["x-lenso-expected-subject"])
    ).toEqual(["alice", "bob"]);
    expect(forwarded.every((headers) => headers.cookie === "session=bob")).toBe(
      true
    );
  });
  // Instance clients added concurrency guards that the old proxy whitelist lost.
  // Neither direct Host tests nor backend URL-switch tests catch their removal.
  test("preserves mount guards when App dev activates a replacement backend", async () => {
    let writes = 0;
    const owner = "example/alpha";
    const createHost = (revision: string, implementation: string) =>
      createServer((req, res) => {
        const expected = {
          "x-lenso-page-owner": owner,
          "x-lenso-page-revision": revision,
          "x-lenso-page-implementation": implementation,
        };
        // Existing direct clients may omit guards. Losing them at the proxy
        // would therefore allow a retired request to dispatch as a new one.
        const changed = Object.entries(expected).some(
          ([name, value]) => req.headers[name] && req.headers[name] !== value
        );
        if (changed) {
          res.statusCode = 409;
          res.end("page_mount_changed");
          return;
        }
        writes += 1;
        res.end("accepted");
      });
    const first = await listen(createHost("1", "a".repeat(64)));
    const second = await listen(createHost("2", "b".repeat(64)));
    const directory = await mkdtemp(join(tmpdir(), "console-mount-backend-"));
    temporaryDirectories.add(directory);
    const backendUrlFile = join(directory, "backend-url");
    await writeFile(backendUrlFile, `${first}/\n`);
    const server = await startConsoleDevServer({ backendUrlFile });
    const submit = (guards: Record<string, string>) =>
      fetch(
        `${server.origin}/api/console/v1/pages/alpha/services/orders/invoke/update`,
        {
          method: "POST",
          headers: {
            origin: server.origin,
            "content-type": "application/json",
            ...guards,
          },
          body: "{}",
        }
      );
    const current = {
      "x-lenso-page-owner": owner,
      "x-lenso-page-revision": "2",
      "x-lenso-page-implementation": "b".repeat(64),
    };
    const initial = await submit({
      ...current,
      "x-lenso-page-revision": "1",
      "x-lenso-page-implementation": "a".repeat(64),
    });
    expect(initial.status).toBe(200);
    await writeFile(backendUrlFile, `${second}/\n`);
    for (const [name, value] of [
      ["x-lenso-page-owner", "example/retired"],
      ["x-lenso-page-revision", "1"],
      ["x-lenso-page-implementation", "a".repeat(64)],
    ] as const) {
      const stale = await submit({ ...current, [name]: value });
      expect(stale.status).toBe(409);
      expect(await stale.text()).toBe("page_mount_changed");
    }
    expect(writes).toBe(1);
    const active = await submit(current);
    expect(active.status).toBe(200);
    expect(writes).toBe(2);
  });

  test("rejects a privileged request from a non-loopback peer", async () => {
    const server = await startConsoleDevServer({
      hostUrl: "http://127.0.0.1:9",
      peerAddress: "192.0.2.10",
    });

    const response = await fetch(`${server.origin}/api/console/v1/apps`, {
      headers: {
        forwarded: "for=127.0.0.1;host=127.0.0.1",
        origin: server.origin,
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-host": new URL(server.origin).host,
      },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("forbidden development request");
  });

  test.each([
    ["missing", undefined],
    ["untrusted", "https://untrusted.example"],
  ])("rejects a privileged request with a %s Origin", async (_, origin) => {
    const server = await startConsoleDevServer({
      hostUrl: "http://127.0.0.1:9",
    });

    const response = await fetch(
      `${server.origin}/api/console/v1/apps`,
      origin ? { headers: { origin } } : {}
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("forbidden development request");
  });

  test("forwards a same-origin browser GET without an Origin header", async () => {
    let forwardedRequests = 0;
    let forwardedTarget: string | undefined;
    const upstream = createServer((req, res) => {
      forwardedRequests += 1;
      forwardedTarget = req.url;
      res.end("same-origin GET");
    });
    const upstreamOrigin = await listen(upstream);
    const server = await startConsoleDevServer({ hostUrl: upstreamOrigin });

    const response = await fetch(
      `${server.origin}/api/console/v1/apps?cursor=next`,
      { headers: sameOriginFetchHeaders() }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("same-origin GET");
    expect(forwardedRequests).toBe(1);
    expect(forwardedTarget).toBe("/api/console/v1/apps?cursor=next");
  });

  test("rejects a loopback peer whose Host only starts with a 127 label", async () => {
    const server = await startConsoleDevServer({
      hostUrl: "http://127.0.0.1:9",
    });

    const response = await requestWithHeaders(
      `${server.origin}/api/console/v1/apps`,
      { host: "127.evil.com", origin: "http://127.evil.com" }
    );

    expect(response.status).toBe(403);
    expect(response.body).toBe("forbidden development request");
  });

  test.each([
    [
      "cross-site Fetch Metadata",
      { ...sameOriginFetchHeaders(), "sec-fetch-site": "cross-site" },
    ],
    ["missing Fetch Metadata", {}],
  ])("rejects an Origin-less GET with %s", async (_, headers) => {
    const server = await startConsoleDevServer({
      hostUrl: "http://127.0.0.1:9",
    });

    const response = await fetch(`${server.origin}/api/console/v1/apps`, {
      headers,
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("forbidden development request");
  });

  test("forwards a privileged request from a loopback peer with the same Origin", async () => {
    let forwardedAuthorization: string | undefined;
    const upstream = createServer((req, res) => {
      forwardedAuthorization = req.headers.authorization;
      res.end("forwarded");
    });
    const upstreamOrigin = await listen(upstream);
    const server = await startConsoleDevServer({
      agentControlToken: "test-only-control-credential",
      hostUrl: upstreamOrigin,
    });

    const response = await fetch(
      `${server.origin}/api/console/v1/agent/control/turns`,
      { headers: { origin: server.origin } }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("forwarded");
    expect(forwardedAuthorization).toBe("Bearer test-only-control-credential");
  });

  test.each(["network-path", "absolute-form"] as const)(
    "rejects a %s request target without forwarding the control credential",
    async (form) => {
      let upstreamRequests = 0;
      const upstream = createServer((_req, res) => {
        upstreamRequests += 1;
        res.end("unexpected upstream request");
      });
      const upstreamOrigin = await listen(upstream);
      const attackerAuthorizations: Array<string | undefined> = [];
      const attacker = createServer((req, res) => {
        attackerAuthorizations.push(req.headers.authorization);
        res.end("unexpected attacker request");
      });
      const attackerOrigin = await listen(attacker);
      const server = await startConsoleDevServer({
        agentControlToken: "test-only-control-credential",
        hostUrl: upstreamOrigin,
      });
      const attackerUrl = new URL(attackerOrigin);
      const maliciousTarget =
        form === "network-path"
          ? `//${attackerUrl.host}/api/console/v1/agent/control/turns`
          : `${attackerOrigin}/api/console/v1/agent/control/turns`;

      const response = await requestWithRawTarget(
        server.origin,
        maliciousTarget
      );

      expect(response).toEqual({ body: "invalid request target", status: 400 });
      expect(upstreamRequests).toBe(0);
      expect(attackerAuthorizations).toEqual([]);
    }
  );

  test("allows an explicitly trusted Origin from a remote peer", async () => {
    let forwardedRequests = 0;
    const upstream = createServer((_req, res) => {
      forwardedRequests += 1;
      res.end("forwarded remotely");
    });
    const upstreamOrigin = await listen(upstream);
    const trustedOrigin = "https://console-dev.example";
    const server = await startConsoleDevServer({
      hostUrl: upstreamOrigin,
      peerAddress: "192.0.2.10",
      trustedOrigin,
    });

    const response = await requestWithHeaders(
      `${server.origin}/api/console/v1/apps`,
      { host: "console-dev.example", origin: trustedOrigin }
    );

    expect(response.status).toBe(200);
    expect(response.body).toBe("forwarded remotely");
    expect(forwardedRequests).toBe(1);
  });

  test("allows an Origin-less same-origin GET for the configured remote host", async () => {
    let forwardedRequests = 0;
    const upstream = createServer((_req, res) => {
      forwardedRequests += 1;
      res.end("remote same-origin GET");
    });
    const upstreamOrigin = await listen(upstream);
    const trustedOrigin = "https://console-dev.example";
    const server = await startConsoleDevServer({
      hostUrl: upstreamOrigin,
      peerAddress: "192.0.2.10",
      trustedOrigin,
    });

    const response = await requestWithHeaders(
      `${server.origin}/api/console/v1/apps`,
      {
        host: "console-dev.example",
        ...sameOriginFetchHeaders(),
      }
    );

    expect(response.status).toBe(200);
    expect(response.body).toBe("remote same-origin GET");
    expect(forwardedRequests).toBe(1);
  });

  test("returns 413 without forwarding a streamed body over one MiB", async () => {
    let forwardedRequests = 0;
    const upstream = createServer((_req, res) => {
      forwardedRequests += 1;
      res.end("unexpected");
    });
    const upstreamOrigin = await listen(upstream);
    const server = await startConsoleDevServer({ hostUrl: upstreamOrigin });

    const response = await requestInChunks(
      `${server.origin}/api/console/v1/agent/control/turns`,
      server.origin,
      [Buffer.alloc(512 * 1024), Buffer.alloc(512 * 1024), Buffer.of(1)]
    );

    expect(response).toEqual({
      body: "request body too large",
      status: 413,
    });
    expect(forwardedRequests).toBe(0);
  });

  test("serves diagnostics only to a loopback peer with the same Origin", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lenso-console-dev-test-"));
    temporaryDirectories.add(directory);
    const diagnosticsFile = join(directory, "diagnostics.json");
    await writeFile(diagnosticsFile, '{"ready":true}');
    const server = await startConsoleDevServer({ diagnosticsFile });

    const accepted = await fetch(
      `${server.origin}/console/dev/diagnostics.json`,
      { headers: { origin: server.origin } }
    );
    const rejected = await fetch(
      `${server.origin}/console/dev/diagnostics.json`
    );

    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ready: true });
    expect(rejected.status).toBe(403);
  });
});

async function startConsoleDevServer({
  agentControlToken,
  backendUrlFile,
  diagnosticsFile,
  hostUrl,
  peerAddress,
  trustedOrigin,
}: {
  agentControlToken?: string;
  backendUrlFile?: string;
  diagnosticsFile?: string;
  hostUrl?: string;
  peerAddress?: string | undefined;
  trustedOrigin?: string;
}) {
  let middleware: Middleware | undefined;
  const plugin = consoleDevPlugin({
    agentControlToken,
    backendUrlFile,
    diagnosticsFile,
    hostUrl,
    trustedOrigin,
  }) as unknown as {
    configureServer(server: {
      middlewares: { use(nextMiddleware: Middleware): void };
    }): void;
  };
  plugin.configureServer({
    middlewares: {
      use(nextMiddleware) {
        middleware = nextMiddleware;
      },
    },
  });
  if (!middleware) {
    throw new Error("Console development middleware was not registered");
  }

  const server = createServer((req, res) => {
    if (peerAddress !== undefined) {
      Object.defineProperty(req.socket, "remoteAddress", {
        configurable: true,
        value: peerAddress,
      });
    }
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Connect middleware reports fallthrough through next().
    middleware?.(req, res, (error) => {
      res.statusCode = error ? 500 : 404;
      res.end(error ? "middleware error" : "next");
    });
  });
  const origin = await listen(server);
  return { origin };
}

async function listen(server: Server) {
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function requestInChunks(url: string, origin: string, chunks: Buffer[]) {
  return new Promise<{ body: string; status: number | undefined }>(
    (resolve, reject) => {
      const outgoing = request(
        url,
        {
          headers: { origin },
          method: "POST",
        },
        (response) => {
          response.setEncoding("utf-8");
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.once("end", () =>
            resolve({ body, status: response.statusCode })
          );
        }
      );
      outgoing.once("error", reject);
      for (const chunk of chunks) {
        outgoing.write(chunk);
      }
      outgoing.end();
    }
  );
}

function sameOriginFetchHeaders() {
  return {
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  };
}

function requestWithHeaders(url: string, headers: Record<string, string>) {
  return new Promise<{ body: string; status: number | undefined }>(
    (resolve, reject) => {
      const outgoing = request(url, { headers }, (response) => {
        response.setEncoding("utf-8");
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.once("end", () =>
          resolve({ body, status: response.statusCode })
        );
      });
      outgoing.once("error", reject);
      outgoing.end();
    }
  );
}

function requestWithRawTarget(origin: string, path: string) {
  const originUrl = new URL(origin);
  return new Promise<{ body: string; status: number | undefined }>(
    (resolve, reject) => {
      const outgoing = request(
        {
          headers: { host: originUrl.host, origin },
          hostname: originUrl.hostname,
          path,
          port: originUrl.port,
          protocol: originUrl.protocol,
        },
        (response) => {
          response.setEncoding("utf-8");
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.once("end", () =>
            resolve({ body, status: response.statusCode })
          );
        }
      );
      outgoing.once("error", reject);
      outgoing.end();
    }
  );
}
