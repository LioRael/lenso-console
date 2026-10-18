import { expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import {
  createConsolePlugin,
  type ConsoleResource,
  type ConsoleService,
} from "@lenso/console";
import {
  createWorkspaceInstallation,
  operation,
} from "@lenso/console-sdk/server";
import { createConsoleAuthentication } from "@lenso/console/auth";
import { definePlugin, startApp } from "@lenso/core";
import { chromium, type Locator } from "playwright";

import { createBuiltShell } from "./shell";

async function reachable(control: Locator) {
  expect(
    await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        [
          [12, 12],
          [rect.width - 12, 12],
          [12, rect.height - 12],
          [rect.width - 12, rect.height - 12],
          [rect.width / 2, rect.height / 2],
        ].every(([x, y]) =>
          element.contains(document.elementFromPoint(rect.x + x!, rect.y + y!))
        )
      );
    })
  ).toBe(true);
}

// Compiler/model checks cannot prove the admitted Shell renders the directory,
// preserves Plugin-owned flows, or restores its return path after a deep reload.
test("compiled plugin settings navigate through the real isolated adapter and retain admission", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "console-settings-browser-")
  );
  let service: ConsoleService | undefined;
  const listener = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      return (
        (await service?.fetch(request)) ?? new Response(null, { status: 404 })
      );
    },
  });
  const { origin } = listener.url;
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const access = { settings: true };
  const errors: string[] = [];
  let value = 0;
  try {
    const entry = path.join(directory, "console");
    const output = path.join(directory, "out");
    await mkdir(output);
    // The separate archive-consumer test proves published-package resolution.
    // This runtime fixture consumes the repository's built React package.
    await mkdir(path.join(directory, "node_modules/@lenso"), {
      recursive: true,
    });
    await symlink(
      path.resolve("packages/console-react"),
      path.join(directory, "node_modules/@lenso/console-react"),
      "dir"
    );
    for (const name of ["member", "admin"]) {
      await mkdir(path.join(entry, name, "preferences"), { recursive: true });
      await writeFile(
        path.join(entry, name, "workspace.ts"),
        `import {defineWorkspace} from "@lenso/console-sdk";
export default defineWorkspace({id:"${name}",path:"/${name}/",access:"${name === "admin" ? "administrator" : "member"}",settings:[{id:"preferences",page:["preferences"],label:"${name === "admin" ? "Private administration" : "Author preferences"}",description:"Applies across the author's works",group:{id:"general",label:"General"}},{id:"about",page:["about"],label:"About this plugin",status:"Test fixture",group:{id:"advanced",label:"Advanced"}}]});`
      );
      await mkdir(path.join(entry, name, "about"));
      await writeFile(
        path.join(entry, name, "about/page.tsx"),
        `import {ConsolePageScope} from "@lenso/console-react";
import type {PageProps} from "@lenso/console-sdk";
export default function About({navigation,activation}:PageProps){return <><ConsolePageScope scopeKey={activation!.key} value={{context:{kind:"hidden"}}}/><section style={{padding:96}}><h1>Plugin information</h1><button onClick={()=>navigation.openSettings()}>Return to settings directory</button></section></>;}`
      );
      await writeFile(
        path.join(entry, name, "page.tsx"),
        `import type {PageProps} from "@lenso/console-sdk";
export default function Home({navigation}:PageProps){return <button onClick={()=>navigation.openSettings()}>Open settings directory</button>;}`
      );
      await writeFile(
        path.join(entry, name, "preferences/page.tsx"),
        `import {useState} from "react";
import type {PageProps} from "@lenso/console-sdk";
export default function Preferences({services,signal}:PageProps){
  const [step,setStep]=useState(false),[result,setResult]=useState<number>(),[changed,setChanged]=useState(0);
  const onChanged=async()=>{const value=await services.invoke<null,number>("preferences","read",null);signal.throwIfAborted();setResult(value);setChanged(count=>count+1);};
  return <section aria-label="Plugin workflow" style={{padding:96}}><h1>Plugin preferences</h1>{step?<><button onClick={async()=>{await services.invoke("preferences","save",null);await onChanged();}}>Apply example preference</button><output aria-label="Preference result">{result}</output><output aria-label="Change notifications">{changed}</output></>:<button onClick={()=>setStep(true)}>Configure example preference</button>}</section>;
}`
      );
    }
    const built = Bun.spawnSync(
      [process.execPath, "packages/console-authoring/compiler/compiler.mjs"],
      {
        stdin: Buffer.from(
          JSON.stringify({
            schema: "lenso.convention-compile.v1",
            entry,
            output,
            owner_project: directory,
            plugin_id: "settings.fixture",
            release_version: "1.0.0",
          })
        ),
      }
    );
    expect(built.exitCode, built.stderr.toString()).toBe(0);
    const installation = createWorkspaceInstallation({
      id: "settings-owner",
      descriptor: JSON.parse(
        await readFile(path.join(output, "descriptor.json"), "utf-8")
      ),
      services: {
        preferences: {
          capabilityId: "fixture.preferences@1",
          version: "1.0.0",
          operations: {
            read: operation({
              effect: "read",
              parse: () => null,
              authorize: () => true,
              handle: () => value,
            }),
            save: operation({
              effect: "write",
              parse: () => null,
              authorize: () => true,
              handle: () => {
                value += 1;
                return value;
              },
            }),
          },
        },
      },
    });
    const mounts = [
      installation.createMount({
        id: "first",
        workspaceId: "member",
        subject: { kind: "console" },
        basePath: "/first/",
      }),
      installation.createMount({
        id: "second",
        workspaceId: "member",
        subject: { kind: "console" },
        basePath: "/second/",
      }),
      installation.createMount({
        id: "private",
        workspaceId: "admin",
        subject: { kind: "console" },
        basePath: "/private/",
      }),
    ];
    const authentication = definePlugin({
      id: "settings-auth",
      setup(context) {
        const auth = createAuth(
          realm(
            "settings-fixture",
            defineSource({
              async verify(token: string | null) {
                return token === "synthetic-settings-reader"
                  ? { status: "verified", subjectId: "reader" }
                  : { status: "rejected" };
              },
            })
          )
        );
        context.onCleanup(() => auth.close());
        return createConsoleAuthentication({
          access: auth
            .for(audience("console"))
            .memberships(async (_actor, resource: ConsoleResource) =>
              resource.action !== "admin" &&
              (!resource.mountId || access.settings)
                ? { active: true }
                : null
            ),
          policy: ({ membership }) => membership.active,
          requestPolicy: { origin, credentialMode: "bearer" },
          evidence: (request) =>
            request.headers.get("authorization")?.slice(7) ?? null,
          permissionRevision: () => String(access.settings),
          session: () => ({ administrator: false, workspace_ids: [] }),
        });
      },
    });
    const shell = await createBuiltShell(
      path.resolve("plugins/console/shell/dist/client"),
      {
        apiBasePath: "/api",
        authBasePath: "/auth",
        workspaces: ["/first/", "/second/", "/private/"],
      }
    );
    const consolePlugin = createConsolePlugin({
      authentication,
      management: true,
      canWrite: () => true,
      targets: [
        {
          id: "self",
          label: "Settings fixture",
          tenantId: "test",
          plugins: [installation.plugin],
          manage: [installation.manage],
          mounts,
        },
      ],
      binding: (_operation, _input, request, _identity, resource) => {
        const mount = mounts.find(
          (candidate) => candidate.descriptor.id === resource.mountId
        )!;
        return {
          context: {
            subject: mount.descriptor.subject,
            owner: mount.descriptor.owner,
            mountId: mount.descriptor.id,
            revision: mount.descriptor.revision,
            signal: request.signal,
          },
        };
      },
      shellMatches: shell.matches,
      shell: shell.fetch,
    });
    app = await startApp({
      plugins: [authentication, installation.plugin, consolePlugin],
    });
    service = app.get(consolePlugin);
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
      extraHTTPHeaders: { authorization: "Bearer synthetic-settings-reader" },
    });
    page.setDefaultTimeout(8000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto(`${origin}/`);
    expect(await page.title()).toBe("Lenso Console");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const directoryPage = page.getByRole("region", {
      name: "Settings",
      exact: true,
    });
    await directoryPage.waitFor();
    expect(await page.locator("vite-error-overlay").count()).toBe(0);
    const entries = directoryPage.getByRole("link");
    expect(await entries.count()).toBe(4);
    expect(
      await entries.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href"))
      )
    ).toEqual([
      "/first/preferences",
      "/second/preferences",
      "/first/about",
      "/second/about",
    ]);
    expect(await page.getByText("Private administration").count()).toBe(0);
    expect(await directoryPage.locator("input,select,button").count()).toBe(0);
    const preferences = entries.filter({ hasText: "Author preferences" });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({
        width: theme === "dark" ? 390 : 1280,
        height: 900,
      });
      await page.waitForFunction(
        (mode) => document.documentElement.dataset.theme === mode,
        theme
      );
      await preferences.first().focus();
      await reachable(preferences.first());
      await page.keyboard.press("Tab");
      expect(
        await preferences
          .last()
          .evaluate((element) => document.activeElement === element)
      ).toBe(true);
      await reachable(preferences.last());
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      if (process.env.LENSO_SETTINGS_SCREENSHOTS) {
        await mkdir(process.env.LENSO_SETTINGS_SCREENSHOTS, {
          recursive: true,
        });
        await page.screenshot({
          path: path.join(
            process.env.LENSO_SETTINGS_SCREENSHOTS,
            `settings-${theme}.png`
          ),
          fullPage: true,
        });
      }
    }
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Plugin preferences" }).waitFor();
    expect(new URL(page.url()).pathname).toBe("/second/preferences");
    await page.reload();
    await page
      .getByRole("button", { name: "Configure example preference" })
      .click();
    await page
      .getByRole("button", { name: "Apply example preference" })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Preference result"]')
          ?.textContent === "1"
    );
    expect(value).toBe(1);
    expect(await page.getByLabel("Change notifications").textContent()).toBe(
      "1"
    );
    await page
      .getByLabel("Task context", { exact: true })
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await directoryPage.waitFor();
    await page.goBack();
    await page.getByRole("heading", { name: "Plugin preferences" }).waitFor();
    await page.goto(`${origin}/first/`);
    await page.getByRole("button", { name: "Open settings directory" }).click();
    await directoryPage.waitFor();
    await entries.filter({ hasText: "About this plugin" }).first().click();
    await page.getByRole("heading", { name: "Plugin information" }).waitFor();
    expect(await page.getByLabel("Task context", { exact: true }).count()).toBe(
      0
    );
    await page
      .getByRole("button", { name: "Return to settings directory" })
      .click();
    await directoryPage.waitFor();
    await page.goto(`${origin}/private/preferences`);
    await page.getByRole("heading", { name: "Page not found" }).waitFor();
    const denied = await page.request.get(
      `${origin}${mounts[2]!.descriptor.module}`
    );
    expect(denied.status()).toBe(403);
    access.settings = false;
    await page.goto(`${origin}/settings`);
    await directoryPage.getByText("No settings are available").waitFor();
    expect(await entries.count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await app?.stop();
    await listener.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
