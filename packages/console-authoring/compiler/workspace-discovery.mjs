import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalWorkspacePath } from "../src/paths.ts";

const sdk = fileURLToPath(new URL("../src/workspace.ts", import.meta.url));
const known = new Set(["id", "title", "path", "index", "access", "services"]);

async function declaration(directory) {
  const source = path.join(directory, "workspace.ts");
  if (!fs.existsSync(source)) {
    return {};
  }
  const result = await Bun.build({
    entrypoints: [source],
    target: "bun",
    plugins: [
      {
        name: "workspace-declaration",
        setup(build) {
          build.onResolve({ filter: /^@lenso\/console-sdk$/ }, () => ({
            path: sdk,
          }));
        },
      },
    ],
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Workspace declaration build failed");
  }
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(await result.outputs[0].text()).toString("base64")}`
  );
  return module.default;
}

/** Explicit convention options and ordinary directories share one selection pipeline. */
export async function discoverWorkspaces(root, pluginId, options = {}) {
  const explicit = options?.workspaces;
  let entries;
  if (
    explicit !== undefined &&
    (!Array.isArray(explicit) || !explicit.length || explicit.length > 32)
  ) {
    throw new Error("Console workspaces must contain 1..32 declarations");
  }
  if (explicit) {
    entries = explicit;
  } else {
    const children = fs
      .readdirSync(root, { withFileTypes: true })
      .filter(
        (item) =>
          item.isDirectory() &&
          !item.name.startsWith(".") &&
          !["node_modules", "dist", "target"].includes(item.name)
      )
      .map((item) => ({ entry: item.name }));
    const rootWorkspace =
      fs.existsSync(path.join(root, "page.tsx")) ||
      fs.existsSync(path.join(root, "workspace.ts"));
    entries = [
      ...(rootWorkspace ? [{ entry: "." }] : []),
      ...children.filter(
        (item) =>
          fs.existsSync(path.join(root, item.entry, "workspace.ts")) ||
          (!rootWorkspace &&
            fs.existsSync(path.join(root, item.entry, "page.tsx")))
      ),
    ];
    if (entries.length === 0) {
      entries = [{ entry: "." }];
    }
  }
  const ids = new Set();
  const directories = new Set();
  const workspaces = [];
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.entry !== "string" ||
      Object.keys(entry).some((key) => key !== "entry" && !known.has(key))
    ) {
      throw new Error("Invalid Console workspace declaration");
    }
    const directory = path.resolve(root, entry.entry);
    if (
      (directory !== root && !directory.startsWith(`${root}${path.sep}`)) ||
      !fs.lstatSync(directory).isDirectory() ||
      directories.has(directory)
    ) {
      throw new Error(
        "Workspace entry must be a unique directory inside console/"
      );
    }
    directories.add(directory);
    const authored = await declaration(directory);
    if (
      !authored ||
      typeof authored !== "object" ||
      Array.isArray(authored) ||
      Object.keys(authored).some((key) => !known.has(key))
    ) {
      throw new Error("workspace.ts must export a workspace declaration");
    }
    const { entry: _entry, ...overrides } = entry;
    const value = { ...authored, ...overrides };
    const id =
      value.id ?? (directory === root ? pluginId : path.basename(directory));
    if (
      typeof id !== "string" ||
      !/^[a-z][a-z0-9._-]{0,63}$/u.test(id) ||
      ids.has(id)
    ) {
      throw new Error(`Invalid or duplicate workspace id: ${id}`);
    }
    ids.add(id);
    const access = value.access ?? "member";
    if (access !== "member" && access !== "administrator") {
      throw new Error("Invalid workspace access");
    }
    const index = value.index ?? [];
    if (
      !Array.isArray(index) ||
      index.length > 8 ||
      index.some(
        (segment) =>
          typeof segment !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(segment)
      )
    ) {
      throw new Error("Workspace index must be a relative static page path");
    }
    const title =
      value.title ??
      (directory === root ? path.basename(path.dirname(root)) : id);
    if (typeof title !== "string" || !title.trim() || title.length > 80) {
      throw new Error("Invalid workspace title");
    }
    if (
      value.services !== undefined &&
      (!Array.isArray(value.services) ||
        value.services.length > 32 ||
        new Set(value.services).size !== value.services.length ||
        value.services.some(
          (service) =>
            typeof service !== "string" ||
            !/^[a-z][a-z0-9._-]{0,63}$/u.test(service)
        ))
    ) {
      throw new Error("Invalid workspace service aliases");
    }
    workspaces.push({
      directory,
      id,
      title,
      access,
      index,
      services: value.services,
      path: canonicalWorkspacePath(
        value.path ?? `/${id}`,
        access === "administrator"
      ),
    });
  }
  return workspaces;
}
