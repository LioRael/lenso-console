import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Prevent repository paths, Git patches and ambient package tools from masking
// a broken public archive; also exercise typed mistakes and emitted server code.
test("packed authoring package compiles a clean consumer and preserves authorization", async () => {
  const temp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "console-author-consumer-"))
  );
  try {
    const pkg = path.resolve(import.meta.dir, "../..");
    const npm = process.env.LENSO_AUTHOR_NPM || "npm";
    const packed = JSON.parse(
      execFileSync(
        npm,
        [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          temp,
          "--cache",
          path.join(temp, "npm-cache"),
        ],
        { cwd: pkg, encoding: "utf-8" }
      )
    );
    const archive = path.join(temp, Object.values(packed)[0].filename);
    const project = path.join(temp, "consumer");
    fs.mkdirSync(project);
    fs.writeFileSync(
      path.join(project, "package.json"),
      JSON.stringify({
        private: true,
        dependencies: {
          "@lenso/console-sdk": `file:${archive}`,
          react: "19.2.8",
        },
      })
    );
    const env = {
      ...process.env,
      BUN_INSTALL_CACHE_DIR: path.join(temp, "cache"),
    };
    const install = Bun.spawnSync(
      [process.execPath, "install", "--ignore-scripts"],
      { cwd: project, env, stdout: "pipe", stderr: "pipe" }
    );
    expect(install.exitCode, install.stderr.toString()).toBe(0);
    const installed = path.join(project, "node_modules/@lenso/console-sdk");
    expect(fs.realpathSync(installed).startsWith(temp)).toBe(true);
    const cli = path.join(installed, "author.mjs");
    const entry = path.join(project, "console");
    const run = (args) =>
      Bun.spawnSync([process.execPath, cli, ...args], {
        cwd: project,
        env: { ...env, LENSO_AUTHOR_EVAL_PROOF: "do-not-evaluate" },
        stdout: "pipe",
        stderr: "pipe",
      });
    expect(run(["init", entry]).exitCode).toBe(0);
    const pageOnly = run(["build", "--entry", entry]);
    expect(pageOnly.exitCode, pageOnly.stderr.toString()).toBe(0);
    expect(fs.existsSync(path.join(entry, "services.ts"))).toBe(false);
    fs.cpSync(path.join(installed, "service-example"), entry, {
      recursive: true,
    });
    const serviceSource = path.join(entry, "services.ts");
    fs.writeFileSync(
      path.join(project, "domain.ts"),
      "export interface Order { id: string; title: string }\n"
    );
    fs.writeFileSync(
      serviceSource,
      fs
        .readFileSync(serviceSource, "utf-8")
        .replace(
          "handle(input) {",
          'handle(input): import("../domain").Order {'
        )
    );

    fs.appendFileSync(
      serviceSource,
      '\nif (process.env.LENSO_AUTHOR_EVAL_PROOF) throw new Error("Unexpected service evaluation");\n'
    );
    const good = run(["build", "--entry", entry]);
    expect(good.exitCode, good.stderr.toString()).toBe(0);
    const output = path.join(entry, ".lenso/console");
    const editorCheck = () =>
      Bun.spawnSync(
        [
          process.execPath,
          path.join(project, "node_modules/typescript/bin/tsc"),
          "--project",
          path.join(output, "tsconfig.authoring.json"),
        ],
        { cwd: project, env, stdout: "pipe", stderr: "pipe" }
      );
    const editorGood = editorCheck();
    expect(editorGood.exitCode, editorGood.stdout.toString()).toBe(0);
    const descriptor = JSON.parse(
      fs.readFileSync(path.join(output, "descriptor.json"), "utf-8")
    );
    const browser = descriptor.assets
      .map((asset) => Buffer.from(asset.content_base64, "base64").toString())
      .join("\n");
    expect(browser).not.toContain("Unexpected service evaluation");
    expect(browser).not.toContain("An order ID is required");
    const serverModule = await import(path.join(output, "services.js"));
    const server = serverModule.default;
    const { createWorkspaceServices } = await import(
      path.join(installed, "src/server.ts")
    );
    const adapter = createWorkspaceServices(server, descriptor.revision);
    const invoke = (id) =>
      adapter.provider.invoke(
        {},
        {
          service_id: "orders",
          operation: "read",
          media_type: "application/json",
          body_base64: Buffer.from(JSON.stringify({ id })).toString("base64"),
        }
      );
    const accepted = await invoke("42");
    expect(accepted.ok).toBe(true);
    expect(
      JSON.parse(Buffer.from(accepted.value.body_base64, "base64").toString())
        .title
    ).toBe("Example order");
    const denied = await invoke("99");
    const invalid = await invoke(42);
    expect(denied.error.error).toBe("denied");
    expect(invalid.error.error).toBe("codec_mismatch");
    fs.writeFileSync(
      path.join(entry, "page.tsx"),
      `import type {PageProps} from "@lenso/console-sdk"; import {bindServices} from "@lenso/console-sdk/services";
export default function Page(props:PageProps){const client=bindServices(props.services); client.ordres; client.orders.reed({id:"42"}); client.orders.read({id:42}); client.orders.read({id:"42"}).then(order=>order.total); return null;}`
    );
    const wrong = run(["check", "--entry", entry]);
    expect(wrong.exitCode).not.toBe(0);
    const diagnostic = wrong.stderr.toString();
    for (const token of ["ordres", "reed", "number", "total"]) {
      expect(diagnostic).toContain(token);
    }
    const editorWrong = editorCheck();
    expect(editorWrong.exitCode).not.toBe(0);
    for (const token of ["ordres", "reed", "number", "total"]) {
      expect(editorWrong.stdout.toString()).toContain(token);
    }
    fs.writeFileSync(
      path.join(entry, "page.tsx"),
      'import services from "./services"; export default function Page(){return <p>{Object.keys(services).join(",")}</p>;}'
    );
    const leak = run(["check", "--entry", entry]);
    expect(leak.exitCode).not.toBe(0);
    expect(leak.stderr.toString()).toContain("server-only");
    fs.writeFileSync(
      path.join(entry, "page.tsx"),
      'import type {PageProps} from "@lenso/console-sdk"; import {bindServices} from "@lenso/console-sdk/services"; export default function Page(props:PageProps){bindServices(props.services); return null;}'
    );
    fs.unlinkSync(serviceSource);
    const removed = run(["check", "--entry", entry]);
    expect(removed.exitCode).not.toBe(0);
    expect(fs.existsSync(path.join(output, "client.ts"))).toBe(false);
    fs.cpSync(path.join(installed, "template"), entry, { recursive: true });
    const rebuilt = run(["build", "--entry", entry]);
    expect(rebuilt.exitCode, rebuilt.stderr.toString()).toBe(0);
    for (const file of ["services.js", "server.ts", "workspace-service.ts"]) {
      expect(fs.existsSync(path.join(output, file))).toBe(false);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}, 180000);
