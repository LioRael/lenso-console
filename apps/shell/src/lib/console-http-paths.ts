export interface ConsoleHttpPaths {
  shell_base_path: string;
  api_base_path: string;
  auth_base_path: string;
}

const defaults: ConsoleHttpPaths = {
  shell_base_path: "/",
  api_base_path: "/api",
  auth_base_path: "/auth",
};

function within(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function parseConsoleHttpPaths(value: unknown): ConsoleHttpPaths {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Console HTTP bootstrap is invalid");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !Object.hasOwn(defaults, key))) {
    throw new TypeError("Console HTTP bootstrap has unknown fields");
  }
  const paths = { ...defaults, ...record };
  for (const path of Object.values(paths)) {
    if (
      typeof path !== "string" ||
      path.length > 128 ||
      !path.startsWith("/") ||
      (path !== "/" &&
        path
          .split("/")
          .slice(1)
          .some(
            (part) =>
              !/^[A-Za-z0-9._-]+$/u.test(part) || part === "." || part === ".."
          ))
    ) {
      throw new TypeError("Console HTTP bootstrap paths must be canonical");
    }
  }
  if (
    paths.api_base_path === "/" ||
    paths.auth_base_path === "/" ||
    within(paths.shell_base_path, paths.api_base_path) ||
    within(paths.api_base_path, paths.auth_base_path) ||
    within(paths.auth_base_path, paths.api_base_path)
  ) {
    throw new TypeError("Console API and Auth prefixes must be separate");
  }
  return paths;
}

const bootstrap =
  typeof document === "undefined"
    ? null
    : document.getElementById("lenso-console-http-paths");
/** Public paths are fixed for this document, never selected from URL realm parameters. */
export const consoleHttpPaths = Object.freeze(
  bootstrap
    ? parseConsoleHttpPaths(JSON.parse(bootstrap.textContent ?? ""))
    : defaults
);

export function consoleApiPath(path: string, paths = consoleHttpPaths) {
  return path === "/api" || path.startsWith("/api/") || path.startsWith("/api?")
    ? `${paths.api_base_path}${path.slice("/api".length)}`
    : path;
}

export function consoleAuthPath(path: string, paths = consoleHttpPaths) {
  return `${paths.auth_base_path}/${path}`;
}

export function isConsoleApiPath(path: string) {
  return within(path, consoleHttpPaths.api_base_path);
}

/** Preserve method/body/headers/signal when Ky or a service client supplies a Request. */
export function mapConsoleApiRequest(
  input: RequestInfo | URL
): RequestInfo | URL {
  if (typeof window === "undefined") {
    return input;
  }
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    window.location.origin
  );
  if (url.origin !== window.location.origin) {
    return input;
  }
  const path = consoleApiPath(url.pathname);
  if (path === url.pathname) {
    return input;
  }
  url.pathname = path;
  return input instanceof Request
    ? new Request(url, input)
    : `${url.pathname}${url.search}${url.hash}`;
}

export function consoleShellPath(path: string) {
  return `${consoleHttpPaths.shell_base_path.replace(/\/$/u, "")}${path}`;
}
