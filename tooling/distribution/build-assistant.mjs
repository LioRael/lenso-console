import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import stylex from "@stylexjs/unplugin/vite";
import { build } from "vite";

const root = resolve(import.meta.dirname, "../..");
const out = resolve(root, "plugins/assistant/console/dist");
const adapters = new Map(
  [
    [
      "plugins/console/shell/src/app/console-session",
      "@lenso/console-sdk/session",
    ],
    [
      "plugins/console/shell/src/app/console-locale",
      "@lenso/console-sdk/locale",
    ],
    [
      "plugins/console/shell/src/features/agent/agent-identity-context",
      "@lenso/console-sdk/agent-target",
    ],
    [
      "plugins/console/shell/src/features/agent/agent-quick-panel-context",
      "@lenso/console-sdk/assistant",
    ],
    [
      "plugins/console/shell/src/features/agent/use-agent-draft",
      "@lenso/console-sdk/drafts",
    ],
    ["plugins/console/shell/src/lib/http-client", "@lenso/console-sdk/http"],
    [
      "plugins/console/shell/src/lib/session-fetch",
      "@lenso/console-sdk/session-http",
    ],
  ].map(([file, name]) => [resolve(root, file), name])
);
const shared = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "@tanstack/react-query",
  "@tanstack/react-router",
];
await build({
  build: {
    emptyOutDir: true,
    lib: {
      cssFileName: "assistant",
      entry: resolve(root, "plugins/assistant/console/entry.tsx"),
      fileName: () => "assistant.cjs",
      formats: ["cjs"],
    },
    minify: true,
    outDir: out,
    rollupOptions: { external: shared },
  },
  configFile: false,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      enforce: "pre",
      name: "assistant-public-singletons",
      resolveId(id, importer) {
        if (shared.includes(id)) {
          return { external: true, id };
        }
        if (importer && id.startsWith(".")) {
          const name = adapters.get(
            resolve(dirname(importer), id).replace(/\.(tsx?|jsx?)$/u, "")
          );
          if (name) {
            return { external: true, id: name };
          }
        }
        return null;
      },
    },
    stylex({ dev: false, useCSSLayers: false }),
  ],
  root,
});
const code = await readFile(resolve(out, "assistant.cjs"), "utf-8");
const builtFiles = await readdir(out);
const chunks = builtFiles.filter(
  (file) => file.endsWith(".cjs") && file !== "assistant.cjs"
);
const imports = [];
const factories = [];
const assets = ["assistant.mjs", "assistant.css"];
for (const [index, file] of chunks.entries()) {
  const source = await readFile(resolve(out, file), "utf-8");
  const name = file.replace(/\.cjs$/u, ".mjs");
  const wrapper = `export function evaluate(require,module,exports) {${source}\n}`;
  if (Buffer.byteLength(wrapper) > 1024 * 1024) {
    throw new Error("Assistant chunk exceeds one MiB");
  }
  await writeFile(resolve(out, name), wrapper);
  imports.push(
    `import {evaluate as chunk${index}} from ${JSON.stringify(`./${name}`)};`
  );
  factories.push(`${JSON.stringify(`./${file}`)}:chunk${index}`);
  assets.push(name);
}
const module = `${imports.join("\n")}\nexport const apiMajor=1;
export function createWorkspace(runtime) {
const factories={${factories.join(",")}};const cache=new Map();
const jsx=(type,props,key)=>runtime.createElement(type,key===undefined?props:{...props,key});
const jsxRuntime={Fragment:runtime.react.Fragment,jsx,jsxs:jsx,jsxDEV:jsx};
const require=(name)=>{
if(name==="react") return runtime.react;
if(name==="react/jsx-runtime"||name==="react/jsx-dev-runtime") return jsxRuntime;
if(Object.hasOwn(runtime.modules??{},name)) return runtime.modules[name];
if(Object.hasOwn(factories,name)) {
if(!cache.has(name)){const child={exports:{}};cache.set(name,child);factories[name](require,child,child.exports);}
return cache.get(name).exports;
}
throw new Error("Unsupported global UI singleton: "+name);
};
const module={exports:{}};const exports=module.exports;
${code}
return module.exports.createWorkspace(runtime);
}`;
if (Buffer.byteLength(module) > 1024 * 1024) {
  throw new Error("Assistant module exceeds the reviewed asset limit");
}
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "assistant.mjs"), module);
await writeFile(resolve(out, "assets.json"), JSON.stringify(assets));
console.log(
  `Built independent assistant UI: ${Buffer.byteLength(module)} bytes`
);
