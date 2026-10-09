import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";

const routes = new Set([
  "/",
  "/management",
  "/authorization",
  "/settings",
  "/settings/general",
  "/settings/appearance",
  "/settings/connections",
  "/plugins",
]);
const namespaces = new Set([
  ...[...routes]
    .filter((route) => route !== "/")
    .map((route) => `/${route.split("/")[1]}`),
  "/assets",
]);

export function overlapsShellNamespace(prefix: string) {
  return [...namespaces].some(
    (namespace) =>
      prefix === namespace ||
      prefix.startsWith(`${namespace}/`) ||
      namespace.startsWith(`${prefix}/`)
  );
}

export async function createBuiltShell(
  directory: string,
  paths: {
    apiBasePath: string;
    authBasePath: string;
  }
) {
  const root = await realpath(directory);
  const within = (filename: string) =>
    filename.startsWith(`${root}${path.sep}`);
  const indexPath = await realpath(path.join(root, "index.html"));
  if (!within(indexPath)) {
    throw new Error("Shell index must remain inside the built directory");
  }
  const index = await readFile(indexPath, "utf-8");
  if (!index.includes("</head>")) {
    throw new Error(
      "Build the original Console Shell before starting the TS host"
    );
  }
  const bootstrap = JSON.stringify({
    shell_base_path: "/",
    api_base_path: paths.apiBasePath,
    auth_base_path: paths.authBasePath,
  })
    .replaceAll("<", "\\u003c")
    .replaceAll("&", "\\u0026");
  const html = index.replace(
    "</head>",
    `<script id="lenso-console-http-paths" type="application/json">${bootstrap}</script></head>`
  );
  const isPage = (pathname: string) =>
    routes.has(pathname.replace(/\/$/, "") || "/") ||
    /^\/plugins\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname);
  const matches = (request: Request) => {
    const { pathname } = new URL(request.url);
    return (
      isPage(pathname) ||
      pathname.startsWith("/assets/") ||
      pathname === "/favicon.svg" ||
      pathname === "/favicon.ico"
    );
  };
  return {
    matches,
    async fetch(request: Request): Promise<Response | undefined> {
      if (!matches(request)) {
        return undefined;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        return new Response(null, { status: 405 });
      }
      const page = isPage(new URL(request.url).pathname);
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response(null, { status: 400 });
      }
      if (
        pathname.includes("\\") ||
        pathname.includes("\0") ||
        pathname.split("/").some((part) => part === "." || part === "..")
      ) {
        return new Response(null, { status: 404 });
      }
      if (page) {
        return new Response(request.method === "HEAD" ? null : html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      const filename = path.resolve(root, `.${pathname}`);
      if (!within(filename)) {
        return new Response(null, { status: 404 });
      }
      try {
        const resolved = await realpath(filename);
        const info = await stat(resolved);
        if (!within(resolved) || !info.isFile()) {
          return new Response(null, { status: 404 });
        }
        const file = Bun.file(resolved);
        return new Response(request.method === "HEAD" ? null : file, {
          headers: {
            "content-type": file.type,
            "x-content-type-options": "nosniff",
          },
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return new Response(null, { status: 404 });
        }
        throw error;
      }
    },
  };
}
