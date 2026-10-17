import type { AuthDiscovery, LoginMethod } from "@lenso/auth/browser";

import { consoleHttpPaths } from "./http-paths";
import { parseSessionCsrf, sessionFetch } from "./session-fetch";

export {
  broadcastConsoleSessionChange,
  onConsoleSessionChange,
} from "./browser-session-events";

export type ConsoleLoginMethod = LoginMethod;
export type ConsoleAuthDiscovery = AuthDiscovery & {
  session?: { logout?: string; renew?: string; status?: string };
};

export type ConsoleAuthenticationState =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "expired"
  | "forbidden"
  | "unavailable";

export class ConsoleAuthenticationError extends Error {
  readonly state: "unauthenticated" | "expired" | "forbidden" | "unavailable";
  constructor(
    state: "unauthenticated" | "expired" | "forbidden" | "unavailable"
  ) {
    super(
      {
        unauthenticated: "Sign in to Console.",
        expired: "Your session ended. Sign in again.",
        forbidden: "This account does not have access to Console.",
        unavailable: "Console is unavailable. Try again.",
      }[state]
    );
    this.state = state;
    this.name = "ConsoleAuthenticationError";
  }
}

export function consoleAuthenticationError(
  status: number,
  previouslyAdmitted = false
) {
  return new ConsoleAuthenticationError(
    status === 401
      ? previouslyAdmitted
        ? "expired"
        : "unauthenticated"
      : status === 412
        ? "expired"
        : status === 403
          ? "forbidden"
          : "unavailable"
  );
}

/** Discovery selects host endpoints, never remote scripts or arbitrary redirect URLs. */
export function consoleAuthAction(path: string): string {
  if (
    !/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/u.test(path) ||
    path.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new TypeError(
      "Authentication actions require exact same-origin paths."
    );
  }
  return path;
}

export function parseConsoleAuthDiscovery(
  value: unknown
): ConsoleAuthDiscovery {
  if (
    !value ||
    typeof value !== "object" ||
    !("methods" in value) ||
    !Array.isArray(value.methods)
  ) {
    throw new TypeError("Authentication methods are unavailable.");
  }
  const ids = new Set<string>();
  const methods = value.methods.map((method): ConsoleLoginMethod => {
    if (
      !method ||
      typeof method !== "object" ||
      typeof method.id !== "string" ||
      !method.id ||
      ids.has(method.id) ||
      typeof method.label !== "string" ||
      !method.label ||
      typeof method.action !== "string" ||
      !["password", "redirect", "custom"].includes(method.kind) ||
      (method.kind === "custom" &&
        (typeof method.renderer !== "string" || !method.renderer))
    ) {
      throw new TypeError("Invalid authentication method.");
    }
    ids.add(method.id);
    return {
      id: method.id,
      label: method.label,
      kind: method.kind,
      action: consoleAuthAction(method.action),
      ...(method.kind === "custom" ? { renderer: method.renderer } : {}),
    } as ConsoleLoginMethod;
  });
  let session: ConsoleAuthDiscovery["session"];
  if ("session" in value && value.session !== undefined) {
    if (!value.session || typeof value.session !== "object") {
      throw new TypeError("Invalid session capabilities.");
    }
    session = {};
    for (const key of ["logout", "renew", "status"] as const) {
      if (key in value.session) {
        const path = (value.session as Record<string, unknown>)[key];
        if (typeof path !== "string") {
          throw new TypeError("Invalid session capability.");
        }
        session = { ...session, [key]: consoleAuthAction(path) };
      }
    }
  }
  const csrf = parseSessionCsrf(value);
  if ("csrf" in value && value.csrf !== undefined && !csrf) {
    throw new TypeError("Invalid authentication CSRF metadata.");
  }
  return {
    methods,
    ...(session ? { session } : {}),
    ...(csrf
      ? {
          csrf: {
            cookie_name: csrf.cookie_name,
            header_name: "x-csrf-token" as const,
          },
        }
      : {}),
  };
}

/** Returns only canonical Console locations or application-approved extra roots. */
export function safeConsoleReturnPath(
  value: string | null | undefined,
  roots: readonly string[] = [consoleHttpPaths.shell_base_path]
): string {
  const allowedRoots = roots.map((root) =>
    root === "/" ? root : consoleAuthAction(root.replace(/\/$/u, ""))
  );
  if (!allowedRoots.length) {
    throw new TypeError("Console return paths require an approved root.");
  }
  const fallback = allowedRoots[0]!;
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some(
      (character) =>
        character.codePointAt(0)! <= 0x20 || character.codePointAt(0) === 0x7f
    ) ||
    /%(?:25|2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(value)
  ) {
    return fallback;
  }
  const url = new URL(value, "https://console.invalid");
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return fallback;
  }
  const reserved = [
    consoleHttpPaths.auth_base_path,
    consoleHttpPaths.api_base_path,
    ...(consoleHttpPaths.workspace_sources ?? []).flatMap((source) => [
      source.auth_base_path,
      source.api_base_path,
    ]),
  ];
  if (
    `${url.pathname}${url.search}${url.hash}` !== value ||
    reserved.some(
      (root) => pathname === root || pathname.startsWith(`${root}/`)
    ) ||
    !allowedRoots.some(
      (root) =>
        root === "/" ||
        url.pathname === (root.replace(/\/$/u, "") || "/") ||
        (root !== "/" &&
          url.pathname.startsWith(`${root.replace(/\/$/u, "")}/`))
    )
  ) {
    return fallback;
  }
  return value;
}

export async function submitConsoleAuthAction(
  action: string,
  input: unknown,
  signal: AbortSignal,
  expectedSubject?: string
) {
  const response = await sessionFetch(consoleAuthAction(action), {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
    headers: {
      "content-type": "application/json",
      ...(expectedSubject
        ? { "x-lenso-expected-subject": expectedSubject }
        : {}),
    },
    body: JSON.stringify(input),
  });
  signal.throwIfAborted();
  if (!response.ok) {
    const failure = consoleAuthenticationError(response.status);
    if (response.status === 401) {
      failure.message =
        "Sign-in was not accepted. Check your account and password.";
    } else if (response.status === 403) {
      failure.message =
        "The application rejected this request. Retry the session or contact its operator.";
    }
    throw failure;
  }
}
