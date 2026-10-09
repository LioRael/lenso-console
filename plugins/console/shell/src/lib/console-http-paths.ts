import { canonicalWorkspacePath } from "../../../../../packages/console-authoring/src/paths";

export interface WorkspaceNavigationCheck {
  path: readonly string[];
  service_id: string;
  operation: string;
  fields: readonly string[];
}

export interface WorkspaceSource {
  id: string;
  account_issuer: string;
  shell_base_path: string;
  api_base_path: string;
  auth_base_path: string;
  mounts: readonly {
    id: string;
    base_path: string;
    navigation_checks: readonly WorkspaceNavigationCheck[];
  }[];
}

export interface ConsoleHttpPaths {
  shell_base_path: string;
  api_base_path: string;
  auth_base_path: string;
  workspace_sources?: readonly WorkspaceSource[];
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
  if (
    Object.keys(record).some(
      (key) => !Object.hasOwn(defaults, key) && key !== "workspace_sources"
    )
  ) {
    throw new TypeError("Console HTTP bootstrap has unknown fields");
  }
  const paths = { ...defaults, ...record };
  for (const path of [
    paths.shell_base_path,
    paths.api_base_path,
    paths.auth_base_path,
  ]) {
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
  if (record.workspace_sources !== undefined) {
    paths.workspace_sources = parseWorkspaceSources(
      record.workspace_sources,
      paths
    );
  }
  return paths;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Workspace source configuration must be an object");
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError("Workspace source configuration has unknown fields");
  }
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9._-]{0,63}$/u.test(value)) {
    throw new TypeError("Workspace source identifier is invalid");
  }
  return value;
}

function sourcePrefix(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new TypeError(
      "Workspace source paths must be canonical and same-origin"
    );
  }
  return value;
}

function parseWorkspaceSources(
  value: unknown,
  current: ConsoleHttpPaths
): WorkspaceSource[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new TypeError("Workspace sources must be a bounded allowlist");
  }
  const ids = new Set<string>();
  const mounts = new Set<string>();
  const routes: string[] = [];
  const apis = [current.api_base_path];
  const auths: string[] = [];
  return value.map((raw) => {
    const source = object(raw);
    keys(source, [
      "id",
      "account_issuer",
      "shell_base_path",
      "api_base_path",
      "auth_base_path",
      "mounts",
    ]);
    const id = identifier(source.id);
    const api = sourcePrefix(source.api_base_path);
    const auth = sourcePrefix(source.auth_base_path);
    const shell = sourcePrefix(source.shell_base_path);
    if (
      typeof source.account_issuer !== "string" ||
      source.account_issuer.length > 256 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(source.account_issuer)
    ) {
      throw new TypeError("Workspace account issuer is invalid");
    }
    if (
      ids.has(id) ||
      apis.some((path) => within(api, path) || within(path, api)) ||
      within(api, current.auth_base_path) ||
      within(current.auth_base_path, api) ||
      apis.some((path) => within(auth, path) || within(path, auth)) ||
      auth === current.auth_base_path ||
      auths.some(
        (path) =>
          within(api, path) ||
          within(path, api) ||
          within(auth, path) ||
          within(path, auth)
      ) ||
      within(api, auth) ||
      within(auth, api) ||
      within(shell, api)
    ) {
      throw new TypeError("Workspace source authority is ambiguous");
    }
    ids.add(id);
    apis.push(api);
    auths.push(auth);
    if (
      !Array.isArray(source.mounts) ||
      !source.mounts.length ||
      source.mounts.length > 16
    ) {
      throw new TypeError("Workspace source mount allowlist is invalid");
    }
    return {
      id,
      account_issuer: source.account_issuer,
      shell_base_path: shell,
      api_base_path: api,
      auth_base_path: auth,
      mounts: source.mounts.map((rawMount) => {
        const mount = object(rawMount);
        keys(mount, ["id", "base_path", "navigation_checks"]);
        const mountId = identifier(mount.id);
        const base =
          typeof mount.base_path === "string" && mount.base_path.endsWith("/")
            ? `${sourcePrefix(mount.base_path.slice(0, -1))}/`
            : "";
        if (
          !base ||
          canonicalWorkspacePath(base) !== base ||
          mounts.has(mountId) ||
          routes.some(
            (route) => base.startsWith(route) || route.startsWith(base)
          )
        ) {
          throw new TypeError(
            "Workspace source Shell route is invalid or ambiguous"
          );
        }
        mounts.add(mountId);
        routes.push(base);
        if (
          !Array.isArray(mount.navigation_checks) ||
          !mount.navigation_checks.length ||
          mount.navigation_checks.length > 32
        ) {
          throw new TypeError(
            "Workspace navigation admission checks are required"
          );
        }
        const paths = new Set<string>();
        const checks = mount.navigation_checks.map((rawCheck) => {
          const check = object(rawCheck);
          keys(check, ["path", "service_id", "operation", "fields"]);
          if (
            !Array.isArray(check.path) ||
            check.path.length > 8 ||
            !check.path.every(
              (part) =>
                typeof part === "string" &&
                /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(part)
            ) ||
            paths.has(check.path.join("/")) ||
            !Array.isArray(check.fields) ||
            !check.fields.length ||
            check.fields.length > 16 ||
            !check.fields.every(
              (field) =>
                typeof field === "string" && /^can_[a-z_]{1,63}$/u.test(field)
            )
          ) {
            throw new TypeError(
              "Workspace navigation admission check is invalid"
            );
          }
          paths.add(check.path.join("/"));
          return {
            path: check.path as string[],
            service_id: identifier(check.service_id),
            operation: identifier(check.operation),
            fields: check.fields as string[],
          };
        });
        return { id: mountId, base_path: base, navigation_checks: checks };
      }),
    };
  });
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
  if (
    within(path, paths.api_base_path) ||
    path.startsWith(`${paths.api_base_path}?`)
  ) {
    return path;
  }
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
