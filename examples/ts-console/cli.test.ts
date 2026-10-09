import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { freePort } from "./test/port";

async function start(
  script: string,
  origin: string,
  database: string,
  api: string,
  auth: string,
  config?: string
) {
  const child = spawn("bun", ["run", script, ...(config ? [config] : [])], {
    cwd: path.resolve("."),
    detached: true,
    env: {
      ...process.env,
      LENSO_TS_ORIGIN: origin,
      LENSO_TS_DATABASE: database,
      LENSO_TS_TOKEN: "isolated-cli-operator-token",
      LENSO_TS_SUBJECT: "operator@localhost.test",
      LENSO_TS_API_PREFIX: api,
      LENSO_TS_AUTH_PREFIX: auth,
      LENSO_TS_SHELL: path.resolve("plugins/console/shell/dist/client"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics += chunk;
  });
  const lines = createInterface({
    input: child.stdout,
    signal: AbortSignal.timeout(20_000),
  });
  const stop = async () => {
    lines.close();
    const signal = (name: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          throw error;
        }
      }
    };
    signal("SIGTERM");
    let forced = false;
    const timeout = setTimeout(() => {
      forced = true;
      signal("SIGKILL");
    }, 5000);
    try {
      // Descendants inherit these pipes. "exit" can precede Bun's cleanup;
      // "close" waits for their stdio too, without accepting forced shutdown.
      await closed;
      expect(forced).toBe(false);
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    for await (const line of lines) {
      if (!line.startsWith("{")) {
        continue;
      }
      const ready = JSON.parse(line);
      if (ready.ready) {
        expect(ready.origin).toBe(origin);
        return { stop };
      }
    }
    throw new Error(`TS command exited before readiness: ${diagnostics}`);
  } catch (error) {
    await stop();
    throw error;
  }
}

// Auth and business workflows live in host tests. Only the commands exercise
// config loading, package conditions and descendant-process shutdown.
test("official built and source commands load config, serve Shell and close their listener", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ts-console-cli-"));
  try {
    // Wrapper exit can precede Bun's asynchronous cleanup. Keep the listener
    // alive briefly during cleanup so the existing network assertion catches it.
    const delayedConfig = path.join(directory, "lenso.config.ts");
    const applicationUrl = pathToFileURL(
      path.resolve("examples/ts-console/lenso.config.ts")
    ).href;
    await writeFile(
      delayedConfig,
      `
import app, { host } from ${JSON.stringify(applicationUrl)};
export { host };
const delay = {
  id: "test-shutdown-delay",
  requires: [host.listener],
  setup(context) {
    context.onCleanup(() => new Promise(resolve => setTimeout(resolve, 100)));
    return {};
  },
};
export default { ...app, plugins: [...app.plugins, delay] };
`
    );
    for (const [script, api, auth] of [
      ["service:ts", "/api", "/auth"],
      ["service:ts:dev", "/api/tenant", "/operator/auth"],
    ] as const) {
      const origin = `http://127.0.0.1:${await freePort()}`;
      const database = path.join(directory, `${script}.sqlite`);
      const migration = Bun.spawn(
        ["bun", "examples/ts-console/locale-store/migrate.ts", database],
        { stdout: "pipe", stderr: "pipe" }
      );
      const diagnostics = await new Response(migration.stderr).text();
      expect(await migration.exited, diagnostics).toBe(0);
      const child = await start(
        script,
        origin,
        database,
        api,
        auth,
        script === "service:ts:dev" ? delayedConfig : undefined
      );
      try {
        const shell = await fetch(origin);
        expect(shell.status).toBe(200);
        const html = await shell.text();
        expect(html).toContain(`"api_base_path":"${api}"`);
        expect(html).toContain(`"auth_base_path":"${auth}"`);
        const methods = await fetch(`${origin}${auth}/methods`);
        expect(methods.status).toBe(200);
        await methods.arrayBuffer();
        const session = await fetch(`${origin}${api}/console/v1/session`);
        expect(session.status).toBe(401);
        await session.arrayBuffer();
      } finally {
        await child.stop();
      }
      await expect(
        fetch(origin, { signal: AbortSignal.timeout(2000) })
      ).rejects.toThrow();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
