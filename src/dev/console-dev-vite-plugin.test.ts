import { mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

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
  diagnosticsFile,
  hostUrl,
  peerAddress,
  trustedOrigin,
}: {
  agentControlToken?: string;
  diagnosticsFile?: string;
  hostUrl?: string;
  peerAddress?: string | undefined;
  trustedOrigin?: string;
}) {
  let middleware: Middleware | undefined;
  const plugin = consoleDevPlugin({
    agentControlToken,
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
