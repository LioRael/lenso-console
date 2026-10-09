import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No TCP address");
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

async function start(
  script: string,
  origin: string,
  database: string,
  api: string,
  auth: string,
  config?: string
) {
  const child = spawn("pnpm", [script, ...(config ? [config] : [])], {
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

// Direct startApp tests do not load trusted lenso.config.ts, resolve its real
// env/file adapters, exercise package conditions, or prove the documented command.
test("official built and source commands load the config and serve the original Shell", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ts-console-cli-"));
  const browser = await chromium.launch({ headless: true });
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
      const child = await start(
        script,
        origin,
        path.join(directory, `${script}.sqlite`),
        api,
        auth,
        script === "service:ts:dev" ? delayedConfig : undefined
      );
      try {
        const context = await browser.newContext({ locale: "en-US" });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/authorization`);
        await page
          .locator('input[name="identifier"]')
          .fill("operator@localhost.test");
        await page
          .locator('input[name="password"]')
          .fill("isolated-cli-operator-token");
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Authorization", exact: true })
          .waitFor();
        await page
          .getByText("local-operator", { exact: true })
          .first()
          .waitFor();
        await page.goto(`${origin}/plugins`);
        await page
          .getByRole("link", { name: "local-locale-store", exact: true })
          .click();
        await page
          .getByRole("tab", { name: "Configuration", exact: true })
          .click();
        await page
          .getByRole("tabpanel", { name: "Configuration", exact: true })
          .getByText("Read-only:", { exact: false })
          .waitFor();
        const configuration = page.getByRole("tabpanel", {
          name: "Configuration",
          exact: true,
        });
        await configuration
          .getByText("values", { exact: true })
          .first()
          .waitFor();
        expect(
          await configuration.getByText("values", { exact: true }).count()
        ).toBe(2);
        await configuration
          .getByText('["databasePath"]', { exact: true })
          .waitFor();
        await configuration
          .getByText("values · Sensitive (value not exposed)", { exact: true })
          .waitFor();
        expect(
          await page
            .getByText("Configuration: resolved · Read-only", { exact: true })
            .count()
        ).toBe(1);
        const inspection = await configuration.textContent();
        expect(inspection).not.toContain(
          path.join(directory, `${script}.sqlite`)
        );
        expect(inspection).not.toContain("isolated-cli-operator-token");
        expect(await page.locator("textarea").count()).toBe(0);
        const cookies = await context.cookies();
        expect(
          cookies.find((cookie) => cookie.name === "__Host-lenso-session")
        ).toMatchObject({ secure: true, httpOnly: true });
        expect(
          cookies.find((cookie) => cookie.name === "__Host-lenso-csrf")
        ).toMatchObject({ secure: true, httpOnly: false });
        const write = await page.evaluate(async (prefix) => {
          const csrf =
            document.cookie
              .split(";")
              .map((part) => part.trim())
              .find((part) => part.startsWith("__Host-lenso-csrf="))
              ?.split("=")[1] ?? "";
          const response = await fetch(`${prefix}/console/v1/locale/default`, {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": csrf,
            },
            body: JSON.stringify({ locale: "zh-CN" }),
          });
          return { status: response.status, snapshot: await response.json() };
        }, api);
        expect(write.status).toBe(200);
        expect(write.snapshot.global_default).toBe("zh-CN");
        expect(errors).toEqual([]);
        await context.close();
      } finally {
        await child.stop();
      }
      await expect(
        fetch(origin, { signal: AbortSignal.timeout(2000) })
      ).rejects.toThrow();
    }
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
