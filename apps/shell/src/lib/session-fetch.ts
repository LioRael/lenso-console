import {
  consoleApiPath,
  isConsoleApiPath,
  mapConsoleApiRequest,
} from "./console-http-paths";

export type CsrfPolicy = { cookie_name: string; header_name: string };
export type SessionFetchScope = {
  apiBasePath: string;
  csrf: CsrfPolicy;
  retire: () => void;
  retireForbidden?: boolean;
};
let csrfPolicy: CsrfPolicy | undefined;

export function configureSessionCsrf(value: unknown) {
  csrfPolicy = parseSessionCsrf(value);
}

export function parseSessionCsrf(value: unknown): CsrfPolicy | undefined {
  if (!value || typeof value !== "object" || !("csrf" in value)) {
    return;
  }
  const policy = value.csrf;
  if (
    !policy ||
    typeof policy !== "object" ||
    !("cookie_name" in policy) ||
    !("header_name" in policy) ||
    typeof policy.cookie_name !== "string" ||
    typeof policy.header_name !== "string"
  ) {
    return;
  }
  if (
    !/^__Host-[A-Za-z0-9_-]+$/u.test(policy.cookie_name) ||
    policy.header_name !== "x-csrf-token"
  ) {
    return;
  }
  return {
    cookie_name: policy.cookie_name,
    header_name: policy.header_name,
  };
}

export async function sessionFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  scope?: SessionFetchScope
): Promise<Response> {
  const mappedInput = scope ? input : mapConsoleApiRequest(input);
  let options = init;
  const browser = typeof window !== "undefined";
  const url = browser
    ? new URL(
        mappedInput instanceof Request ? mappedInput.url : String(mappedInput),
        window.location.origin
      )
    : undefined;
  const local = browser && url?.origin === window.location.origin;
  const method = (
    init?.method ??
    (mappedInput instanceof Request ? mappedInput.method : "GET")
  ).toUpperCase();
  const policy = scope ? scope.csrf : csrfPolicy;
  if (local && policy && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const prefix = `${policy.cookie_name}=`;
    const cookie = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix));
    const token = cookie?.slice(prefix.length);
    if (token) {
      const headers = new Headers(
        init?.headers ??
          (mappedInput instanceof Request ? mappedInput.headers : undefined)
      );
      headers.set(policy.header_name, token);
      options = { ...init, headers };
    }
  }
  const response = await fetch(mappedInput, options);
  // Some transports resolve after cancellation. A retired request cannot expire
  // the current session or return data to its former consumer.
  const signal =
    init?.signal === undefined && mappedInput instanceof Request
      ? mappedInput.signal
      : init?.signal;
  signal?.throwIfAborted();
  if (
    local &&
    scope &&
    url &&
    url.pathname.startsWith(`${scope.apiBasePath}/`) &&
    ([401, 412].includes(response.status) ||
      (response.status === 403 && scope.retireForbidden !== false))
  ) {
    scope.retire();
    return response;
  }
  if (
    local &&
    (response.status === 401 || response.status === 412) &&
    url &&
    isConsoleApiPath(url.pathname) &&
    url.pathname !== consoleApiPath("/api/console/v1/session")
  ) {
    window.dispatchEvent(new Event("lenso-session-expired"));
  }
  return response;
}
