import fs from "node:fs";
import path from "node:path";

const rank = (s) =>
  s.startsWith("[[...")
    ? 3
    : s.startsWith("[...")
      ? 2
      : s.startsWith("[")
        ? 1
        : 0;

export async function discoverPages(root, pluginId, options) {
  const { discoverWorkspaces } = await import("./workspace-discovery.mjs");
  const pages = [];
  const authored = [];
  const workspaceId = pluginId.replace(/\.surface-[a-f0-9]+$/, "");
  const workspaces = await discoverWorkspaces(root, workspaceId, options);
  let count = 0;
  function scan(directory, workspace, segments = []) {
    if (segments.length > 8) {
      throw new Error("Console routes exceed eight segments");
    }
    for (const item of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        item.name.startsWith(".") ||
        ["node_modules", "dist", "target"].includes(item.name)
      ) {
        continue;
      }
      count += 1;
      if (count > 4096) {
        throw new Error("Console source exceeds 4096 entries");
      }
      if (item.isSymbolicLink()) {
        throw new Error("Console source cannot contain symbolic links");
      }
      if (item.isDirectory()) {
        if (
          workspaces.some(
            (candidate) =>
              candidate.directory === path.join(directory, item.name) &&
              candidate !== workspace
          )
        ) {
          continue;
        }
        scan(path.join(directory, item.name), workspace, [
          ...segments,
          item.name,
        ]);
      } else {
        if (/\.tsx?$/.test(item.name)) {
          authored.push(path.join(directory, item.name));
        }
        if (item.name !== "page.tsx") {
          continue;
        }
        if (
          segments.some(
            (s) =>
              !/^([A-Za-z0-9][A-Za-z0-9._-]*|\[(?:\.\.\.)?[A-Za-z][A-Za-z0-9_]*\]|\[\[\.\.\.[A-Za-z][A-Za-z0-9_]*\]\])$/.test(
                s
              )
          )
        ) {
          throw new Error("Invalid Console route segment");
        }
        const names = segments
          .filter((s) => s.startsWith("["))
          .map((s) => s.replaceAll(/[[\].]/g, ""));
        if (segments.slice(0, -1).some((s) => s.includes("..."))) {
          throw new Error("Catch-all routes must be terminal");
        }
        if (new Set(names).size !== names.length) {
          throw new Error("Duplicate Console route parameter");
        }
        pages.push({
          segments,
          source: path.join(directory, item.name),
          workspace,
        });
      }
    }
  }
  for (const workspace of workspaces) {
    scan(workspace.directory, workspace);
  }
  if (!pages.length || pages.length > 32) {
    throw new Error("Console requires 1..32 pages");
  }
  const shapes = pages.map(
    (p) =>
      `${p.workspace.id}:${p.segments
        .map((s) =>
          s.startsWith("[[...")
            ? "[[...]]"
            : s.startsWith("[...")
              ? "[...]"
              : s.startsWith("[")
                ? "[]"
                : s
        )
        .join("/")}`
  );
  if (new Set(shapes).size !== shapes.length) {
    throw new Error("Ambiguous Console routes");
  }
  pages.sort((a, b) => {
    for (
      let i = 0;
      i < Math.min(a.segments.length, b.segments.length);
      i += 1
    ) {
      const difference = rank(a.segments[i]) - rank(b.segments[i]);
      if (difference) {
        return difference;
      }
    }
    return a.segments.join("/").localeCompare(b.segments.join("/"));
  });
  return { pages, authored, workspaces };
}

export function pageBindings(workspaces, pages) {
  const imports = [];
  const checks = [];
  const addImport = (source, type) => {
    const name = `View${imports.length}`;
    imports.push(`import ${name} from ${JSON.stringify(source)};`);
    checks.push(`const Check${name}: React.ComponentType<${type}> = ${name};`);
    return name;
  };
  const routes = pages.map((page) => {
    const Page = addImport(page.source, "PageProps");
    const layers = [];
    for (let depth = 0; depth <= page.segments.length; depth += 1) {
      const directory = path.join(
        page.workspace.directory,
        ...page.segments.slice(0, depth)
      );
      const layer = [];
      for (const [file, name, type] of [
        ["layout", "Layout", "LayoutProps"],
        ["loading", "Loading", "{}"],
        ["error", "Error", "ErrorProps"],
      ]) {
        const source = path.join(directory, `${file}.tsx`);
        if (fs.existsSync(source)) {
          layer.push(`${name}:${addImport(source, type)}`);
        }
      }
      layers.push(`{${layer.join(",")}}`);
    }
    return {
      workspace: page.workspace.id,
      source: `{segments:${JSON.stringify(page.segments)},Page:${Page},layers:[${layers.join(",")}]}`,
    };
  });
  const workspaceRouters = workspaces.map((workspace) => {
    const selected = pages.filter((page) => page.workspace === workspace);
    if (
      !selected.some(
        (page) => page.segments.join("/") === workspace.index.join("/")
      )
    ) {
      throw new Error(
        `Workspace ${workspace.id} homepage is not a static page`
      );
    }
    const notFoundSource = path.join(workspace.directory, "not-found.tsx");
    const notFound = fs.existsSync(notFoundSource)
      ? addImport(notFoundSource, "PageProps")
      : "undefined";
    return `${JSON.stringify(workspace.id)}:createPageRouter([${routes
      .filter((route) => route.workspace === workspace.id)
      .map((route) => route.source)
      .join(",")}],${notFound},${JSON.stringify(workspace.index)})`;
  });
  return { imports, checks, workspaceRouters };
}
