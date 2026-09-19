import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const compiler = path.resolve(import.meta.dir, "../compiler.mjs");
// These protect runtime identity (one React), route matching, and fail-closed
// ambiguity. A successful TS build alone does not execute the produced module.
test("compiled pages use Shell React and match dynamic routes after static routes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "console-pages-"));
  try {
    const entry = path.join(root, "console"),
      output = path.join(root, "out");
    const temporaryCacheRoot = path.join(root, "tmp");
    fs.mkdirSync(path.join(entry, "orders/[id]"), { recursive: true });
    fs.mkdirSync(path.join(entry, "orders/new"), { recursive: true });
    fs.mkdirSync(output);
    fs.mkdirSync(temporaryCacheRoot);
    fs.writeFileSync(path.join(entry, "package.json"), '{"private":true}');
    fs.writeFileSync(
      path.join(entry, "page.tsx"),
      'import {useState,createContext} from "react"; const Context=createContext(null); export default function Page(){const [n]=useState(7); return <h1>{n}</h1>;}'
    );
    fs.writeFileSync(
      path.join(entry, "orders/[id]/page.tsx"),
      'import type {PageProps} from "@lenso/console-sdk"; export default function Page({params}:PageProps){return <h1>{params.id}</h1>;}'
    );
    fs.writeFileSync(
      path.join(entry, "orders/new/page.tsx"),
      "export default function Page(){return <h1>New</h1>;}"
    );
    fs.writeFileSync(
      path.join(entry, "layout.tsx"),
      'import type {LayoutProps} from "@lenso/console-sdk"; export default function Layout({children}:LayoutProps){return <section aria-label="Console layout">{children}</section>;}'
    );
    fs.mkdirSync(path.join(entry, "files/[...path]"), { recursive: true });
    fs.writeFileSync(
      path.join(entry, "files/[...path]/page.tsx"),
      'import type {PageProps} from "@lenso/console-sdk"; export default function Page({params}:PageProps){return <p>{Array.isArray(params.path)?params.path.join("/"):params.path}</p>;}'
    );
    const request = {
      schema: "lenso.convention-compile.v1",
      entry,
      output,
      owner_project: root,
      plugin_id: "example.orders.surface-0123456789ab",
      release_version: "1.0.0",
    };
    const env = { ...process.env, TMPDIR: temporaryCacheRoot };
    delete env.BUN_INSTALL_CACHE_DIR;
    const compile = () =>
      Bun.spawnSync(["bun", compiler], {
        env,
        stdin: Buffer.from(JSON.stringify(request)),
      });
    const result = compile();
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString()).schema).toBe(
      "lenso.convention-compiled.v1"
    );
    const descriptor = JSON.parse(
      fs.readFileSync(path.join(output, "descriptor.json"), "utf-8")
    );
    const module = await import(
      `data:text/javascript;base64,${descriptor.assets[0].content_base64}`
    );
    const { Page } = module.createWorkspace({
      react: React,
      createElement: React.createElement,
      services: {},
    });
    const render = (segments) =>
      renderToStaticMarkup(
        React.createElement(Page, { location: { segments } })
      );
    expect(render([])).toContain("7");
    expect(render([])).toContain("Console layout");
    expect(render(["files", "a", "b"])).toContain("a/b");
    expect(render(["orders", "42"])).toContain("42");
    expect(render(["orders", "new"])).toContain("New");
    fs.writeFileSync(
      path.join(entry, "page.tsx"),
      'const count: number = "wrong"; export default function Page(){return <p>{count}</p>;}'
    );
    const invalid = compile();
    expect(invalid.exitCode).not.toBe(0);
    expect(invalid.stderr.toString()).toContain("not assignable");
    fs.writeFileSync(
      path.join(entry, "page.tsx"),
      "export default function Page(){return null;}"
    );
    fs.mkdirSync(path.join(entry, "orders/[other]"));
    fs.writeFileSync(
      path.join(entry, "orders/[other]/page.tsx"),
      "export default function Page(){return null;}"
    );
    expect(compile().exitCode).not.toBe(0);
    expect(
      fs
        .readdirSync(temporaryCacheRoot)
        .filter((name) => name.startsWith("lenso-console-bun-"))
    ).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
