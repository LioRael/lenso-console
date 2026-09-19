import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { typecheck } from "./typecheck.mjs";

const request = JSON.parse(await Bun.stdin.text());
if (request.schema !== "lenso.convention-compile.v1") {
  throw new Error("Unsupported convention request");
}
const root = request.entry;
if (!fs.lstatSync(root).isDirectory()) {
  throw new Error("Console entry must be a directory");
}
const pages = [];
const authored = [];
let count = 0;
function scan(directory, segments = []) {
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
      scan(path.join(directory, item.name), [...segments, item.name]);
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
      pages.push({ segments, source: path.join(directory, item.name) });
    }
  }
}
scan(root);
if (!pages.length || pages.length > 32) {
  throw new Error("Console requires 1..32 pages");
}
const shapes = pages.map((p) =>
  p.segments
    .map((s) =>
      s.startsWith("[[...")
        ? "[[...]]"
        : s.startsWith("[...")
          ? "[...]"
          : s.startsWith("[")
            ? "[]"
            : s
    )
    .join("/")
);
if (new Set(shapes).size !== shapes.length) {
  throw new Error("Ambiguous Console routes");
}
const rank = (s) =>
  s.startsWith("[[...")
    ? 3
    : s.startsWith("[...")
      ? 2
      : s.startsWith("[")
        ? 1
        : 0;
pages.sort((a, b) => {
  for (let i = 0; i < Math.min(a.segments.length, b.segments.length); i += 1) {
    const difference = rank(a.segments[i]) - rank(b.segments[i]);
    if (difference) {
      return difference;
    }
  }
  return a.segments.join("/").localeCompare(b.segments.join("/"));
});
if (fs.existsSync(path.join(root, "package.json"))) {
  const installed = Bun.spawnSync(
    ["bun", "install", "--ignore-scripts", "--no-save"],
    { cwd: root, stdout: "pipe", stderr: "inherit" }
  );
  process.stderr.write(installed.stdout);
  if (installed.exitCode !== 0) {
    throw new Error("Console dependency installation failed");
  }
}
const out = request.output;
const entry = path.join(out, "workspace-entry.ts");
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
    const directory = path.join(root, ...page.segments.slice(0, depth));
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
  return `{segments:${JSON.stringify(page.segments)},Page:${Page},layers:[${layers.join(",")}]}`;
});
const notFoundSource = path.join(root, "not-found.tsx");
const notFound = fs.existsSync(notFoundSource)
  ? addImport(notFoundSource, "PageProps")
  : "undefined";
fs.writeFileSync(
  entry,
  `${imports.join("\n")}\nimport {createPageRouter} from ${JSON.stringify(path.join(import.meta.dir, "router.ts"))};\nexport function createWorkspace(runtime) { const Page=createPageRouter([${routes.join(",")}],${notFound}); return {Page(props) { return runtime.createElement(Page,{...props,services:runtime.services}); }}; }`
);
const sdk = path.resolve(import.meta.dir, "../console-sdk/src/index.ts");
await typecheck({ root, out, authored, imports, checks, sdk });
const result = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  format: "cjs",
  external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime"],
  splitting: false,
  minify: true,
  plugins: [
    {
      name: "console-shared-runtime",
      setup(build) {
        build.onResolve({ filter: /^@lenso\/console-sdk\/server$/ }, () => {
          throw new Error(
            "Server services cannot be imported by a browser page"
          );
        });
        build.onLoad({ filter: /[/\\]services\.ts$/ }, (args) => {
          if (args.path === path.join(root, "services.ts")) {
            throw new Error("services.ts is server-only");
          }
        });
        build.onResolve({ filter: /^@lenso\/console-sdk$/ }, () => ({
          path: sdk,
        }));
      },
    },
  ],
});
if (!result.success) {
  throw new AggregateError(result.logs, "Console page build failed");
}
const assets = [];
for (const output of result.outputs) {
  const extension = path.extname(output.path);
  if (![".js", ".css"].includes(extension)) {
    throw new Error("Console v1 assets support JavaScript and CSS only");
  }
  const bytes =
    extension === ".js"
      ? Buffer.from(`export const apiMajor=1; export function createWorkspace(runtime) { const jsx=(type,props,key)=>runtime.createElement(type,key===undefined?props:{...props,key}); const jsxRuntime={Fragment:runtime.react.Fragment,jsx,jsxs:jsx,jsxDEV:jsx}; const require=(name)=>{if(name==="react") return runtime.react; if(name==="react/jsx-runtime" || name==="react/jsx-dev-runtime") return jsxRuntime; throw new Error("Unsupported workspace external: "+name);}; const module={exports:{}}; const exports=module.exports; ${await output.text()}
return module.exports.createWorkspace(runtime); }`)
      : Buffer.from(await output.arrayBuffer());
  if (bytes.length > 1024 * 1024) {
    throw new Error("Console asset exceeds 1 MiB");
  }
  assets.push({
    path: extension === ".js" ? "workspace.mjs" : "workspace.css",
    media_type:
      extension === ".js"
        ? "text/javascript; charset=utf-8"
        : "text/css; charset=utf-8",
    content_base64: bytes.toString("base64"),
  });
}
const workspace = request.plugin_id.replace(/\.surface-[a-f0-9]+$/, "");
if (!/^[a-z][a-z0-9._-]{0,63}$/.test(workspace)) {
  throw new Error("Console workspace identity exceeds the public contract");
}
const title = path.basename(path.dirname(root));
const descriptor = {
  workspace_id: workspace,
  title,
  revision: createHash("sha256").update(JSON.stringify(assets)).digest("hex"),
  module: "workspace.mjs",
  styles: assets.filter((a) => a.path.endsWith(".css")).map((a) => a.path),
  navigation: {
    label: title.slice(0, 40),
    items: pages
      .filter((p) => !p.segments.some((s) => s.startsWith("[")))
      .map((p) => ({ label: p.segments.at(-1) || "Home", path: p.segments })),
  },
  assets,
  requirements: [],
};
// Generated provider uses the existing public contract; the Shell never imports source.
fs.copyFileSync(
  path.resolve(
    import.meta.dir,
    "../../contracts/crates/lenso-capability-ui-contribution/generated/bindings.ts"
  ),
  path.join(out, "contribution.ts")
);
fs.writeFileSync(path.join(out, "descriptor.json"), JSON.stringify(descriptor));
const hasServices = fs.existsSync(path.join(root, "services.ts"));
if (hasServices) {
  fs.copyFileSync(
    path.join(
      import.meta.dir,
      "../console-sdk/src/generated/workspace-service.ts"
    ),
    path.join(out, "workspace-service.ts")
  );
  const backend = await Bun.build({
    entrypoints: [path.join(root, "services.ts")],
    target: "bun",
    format: "esm",
    plugins: [
      {
        name: "console-server-sdk",
        setup(build) {
          build.onResolve({ filter: /^@lenso\/console-sdk\/server$/ }, () => ({
            path: path.join(import.meta.dir, "../console-sdk/src/server.ts"),
          }));
        },
      },
    ],
  });
  if (!backend.success) {
    throw new AggregateError(backend.logs, "Console service build failed");
  }
  const backendSource = await backend.outputs[0].text();
  descriptor.revision = createHash("sha256")
    .update(JSON.stringify(assets))
    .update(backendSource)
    .digest("hex");
  fs.writeFileSync(
    path.join(out, "descriptor.json"),
    JSON.stringify(descriptor)
  );
  fs.writeFileSync(path.join(out, "services.js"), backendSource);
  fs.copyFileSync(
    path.join(import.meta.dir, "../console-sdk/src/server.ts"),
    path.join(out, "server.ts")
  );
  const server = fs
    .readFileSync(path.join(out, "server.ts"), "utf-8")
    .replace('"./generated/workspace-service"', '"./workspace-service"');
  fs.writeFileSync(path.join(out, "server.ts"), server);
}
fs.writeFileSync(
  path.join(out, "plugin.ts"),
  `import {definePlugin} from "@lenso/bun-plugin";
import {Contribution, type ContributionProvider, type DescribeContributionResponse} from "./contribution.ts";
import descriptor from "./descriptor.json";
${hasServices ? 'import {WorkspaceService, type WorkspaceServiceProvider} from "./workspace-service.ts"; import services from "./services.js"; import {createWorkspaceServices} from "./server.ts";' : ""}
export default definePlugin({provides:[Contribution${hasServices ? ",WorkspaceService" : ""}],create(): ContributionProvider${hasServices ? " & WorkspaceServiceProvider" : ""} {
${hasServices ? "const adapter=createWorkspaceServices(services,descriptor.revision);" : ""}
return {${hasServices ? "...adapter.provider," : ""}async describe_contribution(){return {ok:true,value:{...descriptor,requirements:${hasServices ? "adapter.requirements" : "descriptor.requirements"}} as DescribeContributionResponse};}};}});
`
);
fs.writeFileSync(
  path.join(out, "package.json"),
  JSON.stringify(
    {
      name: request.plugin_id,
      version: request.release_version,
      private: true,
      type: "module",
      dependencies: {
        "@lenso/bun-plugin": "0.4.1",
        "@lenso/contract-runtime": "0.3.0",
      },
      devDependencies: { typescript: "7.0.2", "@types/bun": "1.4.0" },
      scripts: { check: "tsc --noEmit" },
      lenso: {
        pluginId: request.plugin_id,
        rootSlot: "console-workspaces",
        runtime: "bun",
        source: "plugin.ts",
      },
    },
    null,
    2
  )
);
fs.writeFileSync(
  path.join(out, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      allowJs: true,
      strict: true,
      noEmit: true,
      module: "Preserve",
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      types: ["bun"],
    },
    include: ["plugin.ts", "contribution.ts"],
  })
);
fs.unlinkSync(entry);
process.stdout.write(
  JSON.stringify({ schema: "lenso.convention-compiled.v1" })
);
