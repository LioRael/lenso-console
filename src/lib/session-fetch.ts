type CsrfPolicy = { cookie_name: string; header_name: string };
let csrfPolicy: CsrfPolicy | undefined;

export function configureSessionCsrf(value: unknown) {
  csrfPolicy = undefined;
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
  csrfPolicy = {
    cookie_name: policy.cookie_name,
    header_name: policy.header_name,
  };
}

export async function sessionFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let options = init;
  const browser = typeof window !== "undefined";
  const url = browser
    ? new URL(
        input instanceof Request ? input.url : String(input),
        window.location.origin
      )
    : undefined;
  const local = browser && url?.origin === window.location.origin;
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (local && csrfPolicy && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const prefix = `${csrfPolicy.cookie_name}=`;
    const cookie = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix));
    const token = cookie?.slice(prefix.length);
    if (token) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      headers.set(csrfPolicy.header_name, token);
      options = { ...init, headers };
    }
  }
  const response = await fetch(input, options);
  if (
    local &&
    response.status === 401 &&
    url?.pathname.startsWith("/api/") &&
    url.pathname !== "/api/console/v1/session"
  ) {
    window.dispatchEvent(new Event("lenso-session-expired"));
  }
  return response;
}
