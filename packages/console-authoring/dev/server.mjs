import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import stylex from "@stylexjs/unplugin/vite";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import { pageBindings } from "../compiler/page-discovery.mjs";
import { previewFileAccess } from "./file-access.mjs";
import { previewModule } from "./preview-module.mjs";
import { backendProxy } from "./proxy.mjs";

const sdk = path.resolve(import.meta.dirname, "..");
const directory = import.meta.dirname;
const require = createRequire(import.meta.url);
const virtual = (name) => `\0${name}`;
const escapeHtml = (value) => value.replaceAll("<", "\\u003c");
function discoverPages(entry, pluginId) {
  const result = JSON.parse(
    execFileSync(
      process.env.LENSO_CONSOLE_BUN || "bun",
      [path.join(directory, "discover.mjs"), entry, pluginId],
      { encoding: "utf-8", maxBuffer: 2 * 1024 * 1024 }
    )
  );
  for (const page of result.pages) {
    page.workspace = result.workspaces.find(
      (workspace) => workspace.id === page.workspace.id
    );
  }
  return result;
}

export async function dev({
  entry: entryPath,
  pluginId = "example.console",
  port = 5174,
  backendUrl,
  examples: examplesPath,
  open = false,
}) {
  const entry = fs.realpathSync(entryPath);
  if (!fs.statSync(entry).isDirectory()) {
    throw new Error("Console entry must be a directory");
  }
  const parent = path.dirname(entry);
  const owner =
    path.basename(entry) === "console" ||
    fs.existsSync(path.join(parent, "package.json"))
      ? parent
      : entry;
  const consumerRequire = createRequire(path.join(owner, "package.json"));
  const examples = examplesPath
    ? fs.realpathSync(path.resolve(examplesPath))
    : undefined;
  if (
    examples &&
    (!examples.startsWith(owner + path.sep) || !fs.statSync(examples).isFile())
  ) {
    throw new Error(
      "Examples must be a browser module inside the plugin directory"
    );
  }
  if (backendUrl && examples) {
    throw new Error(
      "--examples and --backend select different data sources; choose one"
    );
  }
  let backend;
  let paths = {
    shell_base_path: "/",
    api_base_path: "/api",
    auth_base_path: "/auth",
  };
  if (backendUrl) {
    backend = new URL(backendUrl);
    if (
      !["http:", "https:"].includes(backend.protocol) ||
      backend.username ||
      backend.password ||
      backend.search ||
      backend.hash
    ) {
      throw new Error("Backend must be a credential-free Console HTTP(S) URL");
    }
    const response = await fetch(backend, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error("Backend Console bootstrap is unavailable");
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        throw new Error("Backend Console bootstrap exceeds 1 MiB");
      }
      chunks.push(chunk);
    }
    const html = Buffer.concat(chunks).toString("utf-8");
    const match = html.match(
      /<script\b[^>]*\bid=["']lenso-console-http-paths["'][^>]*>([\s\S]*?)<\/script>/u
    );
    if (!match) {
      throw new Error(
        "Backend must provide the compatible Console public HTTP bootstrap"
      );
    }
    paths = JSON.parse(
      execFileSync(
        process.env.LENSO_CONSOLE_BUN || "bun",
        [path.join(directory, "discover.mjs"), "--http-paths", match[1]],
        { encoding: "utf-8", maxBuffer: 1024 * 1024 }
      )
    );
  }
  const base = `${paths.shell_base_path.replace(/\/$/u, "")}/`;
  const origin = `http://127.0.0.1:${port}`;
  let discovered = await discoverPages(entry, pluginId);
  const pageSource = () => {
    const { imports, workspaceRouters } = pageBindings(
      discovered.workspaces,
      discovered.pages
    );
    return `${imports.join("\n")}\nimport React from "react";\nimport {createPageRouter} from ${JSON.stringify(path.join(sdk, "compiler/router.ts"))};\nconst pages={${workspaceRouters.join(",")}};\nexport default function PreviewPage(props) {const Page=pages[props.mount.pageId ?? props.mount.id]; if(!Page) throw new Error("Local workspace declaration does not match backend page identity"); return React.createElement(Page,props);}`;
  };
  const resolveSingleton = (name) => {
    try {
      return consumerRequire.resolve(name);
    } catch {
      return require.resolve(name);
    }
  };
  const reactVersion = JSON.parse(
    fs.readFileSync(resolveSingleton("react/package.json"), "utf-8")
  ).version;
  const domVersion = JSON.parse(
    fs.readFileSync(resolveSingleton("react-dom/package.json"), "utf-8")
  ).version;
  if (reactVersion !== domVersion) {
    throw new Error(
      `Preview requires matching React and ReactDOM versions; found ${reactVersion} and ${domVersion}. Install matching versions in the plugin package.`
    );
  }
  const proxy = backend ? backendProxy(backend, paths, origin) : undefined;
  const server = await createServer({
    configFile: false,
    envDir: false,
    root: directory,
    base,
    publicDir: false,
    cacheDir: path.join(entry, ".lenso/console-preview-vite"),
    define: {
      "import.meta.env.VITE_CONSOLE_MODE": JSON.stringify(
        backend ? "api" : "mock"
      ),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify("/"),
      "import.meta.env.VITE_CONSOLE_DEV_MODE": JSON.stringify(
        backend ? "host" : "mock"
      ),
      "import.meta.env.VITE_CONSOLE_DEV_TARGET_LABEL": JSON.stringify(
        backend
          ? "Compatible backend; normal authentication required"
          : "UI preview; example data only"
      ),
    },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "@base-ui/react",
        "@tanstack/react-router",
        "@tanstack/react-query",
      ],
      alias: [
        { find: /^react$/, replacement: resolveSingleton("react") },
        {
          find: /^react\/jsx-runtime$/,
          replacement: resolveSingleton("react/jsx-runtime"),
        },
        {
          find: /^react\/jsx-dev-runtime$/,
          replacement: resolveSingleton("react/jsx-dev-runtime"),
        },
        { find: /^react-dom$/, replacement: resolveSingleton("react-dom") },
        {
          find: /^react-dom\/client$/,
          replacement: resolveSingleton("react-dom/client"),
        },
      ],
    },
    plugins: [
      {
        name: "lenso-console-author-preview",
        enforce: "pre",
        resolveId(id, importer) {
          if (
            ["virtual:lenso-preview", "virtual:lenso-preview-page"].includes(id)
          ) {
            return virtual(id);
          }
          const localImport =
            importer && id.startsWith(".")
              ? path.resolve(path.dirname(importer.split("?", 1)[0]), id)
              : id;
          if (
            id === "@lenso/console-sdk/server" ||
            localImport === path.join(entry, "services.ts") ||
            `${localImport}.ts` === path.join(entry, "services.ts")
          ) {
            throw new Error(
              "Server services cannot be imported by a browser page"
            );
          }
          if (id === "@lenso/console-sdk/services") {
            return virtual("lenso-preview-services");
          }
          if (id.startsWith("@lenso/console-sdk")) {
            const suffix = id.slice("@lenso/console-sdk".length);
            const file = suffix === "" ? "index" : suffix.slice(1);
            if (!["index", "locale", "i18n", "client"].includes(file)) {
              throw new Error(`Unsupported browser SDK import: ${id}`);
            }
            return path.join(sdk, "src", `${file}.ts`);
          }
        },
        load(id) {
          if (id === virtual("virtual:lenso-preview-page")) {
            return pageSource();
          }
          if (id === virtual("virtual:lenso-preview")) {
            return previewModule({
              ...discovered,
              backend: !!backend,
              examples,
            });
          }
          if (id === virtual("lenso-preview-services")) {
            return `import {createClient} from ${JSON.stringify(path.join(sdk, "src/client.ts"))}; export const bindServices = createClient;`;
          }
        },
        configureServer(vite) {
          vite.middlewares.use(previewFileAccess(vite));
          vite.middlewares.use((req, _res, next) => {
            // StyleX's dev CSS middleware runs before Vite strips a non-root base.
            if (req.url?.split("?", 1)[0] === `${base}virtual:stylex.css`) {
              req.url = req.url.slice(base.length - 1);
            }
            next();
          });
          if (backend) {
            vite.middlewares.use(proxy);
          } else {
            vite.middlewares.use((req, res, next) => {
              if (
                req.url?.startsWith(`${paths.api_base_path}/`) ||
                req.url?.startsWith(`${paths.auth_base_path}/`)
              ) {
                res.writeHead(503, { "content-type": "application/json" });
                res.end(
                  JSON.stringify({
                    detail:
                      "UI preview has no backend; use explicit example data or --backend.",
                  })
                );
              } else {
                return next();
              }
            });
          }
          const serveHtml = async (req, res) => {
            const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>Lenso Console — Plugin preview</title><script id="lenso-console-http-paths" type="application/json">${escapeHtml(JSON.stringify(paths))}</script></head><body><div id="root"></div><script type="module" src="/browser.tsx"></script></body></html>`;
            res.setHeader("content-type", "text/html");
            res.end(await vite.transformIndexHtml(req.url, html));
          };
          const serveHtmlSafely = async (req, res, next) => {
            try {
              await serveHtml(req, res);
            } catch (error) {
              return next(error);
            }
          };
          vite.middlewares.use((req, res, next) => {
            if (!req.headers.accept?.includes("text/html")) {
              return next();
            }
            void serveHtmlSafely(req, res, next);
          });
          vite.watcher.add(entry);
          const refresh = async (file) => {
            if (
              !file.startsWith(entry + path.sep) ||
              !/(?:workspace\.ts|(?:page|layout|loading|error|not-found)\.tsx)$/u.test(
                file
              )
            ) {
              return;
            }
            try {
              discovered = await discoverPages(entry, pluginId);
              for (const id of [
                virtual("virtual:lenso-preview"),
                virtual("virtual:lenso-preview-page"),
              ]) {
                const module =
                  vite.environments.client.moduleGraph.getModuleById(id);
                if (module) {
                  vite.environments.client.moduleGraph.invalidateModule(module);
                }
              }
              vite.ws.send({ type: "full-reload" });
            } catch (error) {
              vite.ws.send({
                type: "error",
                err: { message: error.message, stack: error.stack },
              });
            }
          };
          vite.watcher.on("add", refresh).on("unlink", refresh);
          vite.watcher.on("change", (file) => {
            if (file.endsWith("/workspace.ts")) {
              void refresh(file);
            }
          });
        },
      },
      react({ include: /\.(?:jsx|tsx)$/u, exclude: [] }),
      stylex({ dev: false, devMode: "full", useCSSLayers: false }),
    ],
    optimizeDeps: {
      include: [
        "react",
        "react-dom/client",
        "@lenso/ui/**",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "@base-ui/react",
        "@stylexjs/stylex",
        "ky",
        "lucide-react",
        "gsap",
        "@gsap/react",
        "smol-toml",
        "streamdown",
        "@streamdown/cjk",
        "@tiptap/react",
        "@tiptap/starter-kit",
        "@tiptap/extension-placeholder",
        "@tiptap/extension-table",
        "@tiptap/extension-task-item",
        "@tiptap/extension-task-list",
        "@tiptap/markdown",
        "use-sync-external-store/shim",
        "use-sync-external-store/shim/with-selector",
      ],
    },
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      allowedHosts: ["127.0.0.1"],
      cors: false,
      fs: {
        strict: true,
        allow: [
          directory,
          path.join(sdk, "src"),
          path.join(sdk, "compiler"),
          owner,
          path.dirname(path.dirname(require.resolve("vite/package.json"))),
        ],
      },
    },
  });
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw error;
  }
  let closing;
  const shutdown = async () => {
    proxy?.close();
    await server.close();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  };
  const stop = () => {
    closing ??= shutdown();
    return closing;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(
    `Console plugin preview: ${origin}${base}\n${backend ? "Backend connected; normal authentication, authorization and CSRF remain required." : "UI preview only. Services require explicit --examples; no backend is running."}\nPress Ctrl+C to stop.`
  );
  if (open) {
    await server.openBrowser();
  }
  return { server, stop };
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  await dev(JSON.parse(process.argv[2]));
}
