import {
  consoleApiPath,
  isConsoleApiPath,
  mapConsoleApiRequest,
} from "./http-paths";
import {
  createConsoleWorkspaceServices,
  WorkspaceServiceError,
  type ConsoleWorkspaceServicesOptions,
} from "./transport";

export type CsrfPolicy = { cookie_name: string; header_name: string };
export type SessionFetchScope = {
  apiBasePath: string;
  csrf: CsrfPolicy;
  retire: () => void;
  readScope?: string;
  signal?: AbortSignal;
  revalidate?: () => Promise<void>;
};
let csrfPolicy: CsrfPolicy | undefined;
let ordinaryScope: string | undefined;
let ordinaryLifetime = new AbortController();
let revalidateOrdinary: (() => Promise<void>) | undefined;

export function retireSessionReads() {
  ordinaryLifetime.abort();
  ordinaryLifetime = new AbortController();
  ordinaryScope = undefined;
  revalidateOrdinary = undefined;
}

export function configureSessionReadScope(
  scope: string | null,
  revalidate: () => Promise<void>
) {
  ordinaryScope =
    scope && /^(?:local|[a-f0-9]{64})$/u.test(scope) ? scope : undefined;
  revalidateOrdinary = revalidate;
}

async function revalidateScope(scope?: SessionFetchScope) {
  try {
    await (scope ? scope.revalidate?.() : revalidateOrdinary?.());
  } catch {
    // An outage is not evidence of revoked membership; bounded session checks retry.
  }
}

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
  scope?: SessionFetchScope,
  captureStatus?: (handle: (status: number) => void) => void
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
  const scopedApi =
    local &&
    url &&
    (scope
      ? url.pathname.startsWith(`${scope.apiBasePath}/`)
      : isConsoleApiPath(url.pathname) &&
        url.pathname !== consoleApiPath("/api/console/v1/session"));
  const lifetime = scopedApi
    ? scope
      ? scope.signal
      : ordinaryLifetime.signal
    : undefined;
  const expectedScope = scope ? scope.readScope : ordinaryScope;
  const requestSignal =
    init?.signal === undefined && mappedInput instanceof Request
      ? mappedInput.signal
      : init?.signal;
  if (lifetime) {
    options = {
      ...init,
      signal: requestSignal
        ? AbortSignal.any([requestSignal, lifetime])
        : lifetime,
    };
    options.signal?.throwIfAborted();
  }
  const handleStatus = (status: number) => {
    requestSignal?.throwIfAborted();
    lifetime?.throwIfAborted();
    if (!scopedApi) {
      return;
    }
    if ([401, 412].includes(status)) {
      if (scope) {
        scope.retire();
      } else {
        retireSessionReads();
        window.dispatchEvent(new Event("lenso-session-expired"));
      }
    } else if (status === 403) {
      // Revalidation may queue behind the caller's shared identity lock.
      void revalidateScope(scope);
    }
  };
  captureStatus?.(handleStatus);
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
      options = { ...options, headers };
    }
  }
  const response = await fetch(mappedInput, options);
  try {
    // Some transports resolve after cancellation. A retired request cannot expire
    // the current session or return data to its former consumer.
    const signal =
      init?.signal === undefined && mappedInput instanceof Request
        ? mappedInput.signal
        : init?.signal;
    signal?.throwIfAborted();
    lifetime?.throwIfAborted();
    if (scopedApi) {
      const receivedScope = response.headers.get("x-lenso-read-scope");
      const changed =
        response.ok &&
        expectedScope !== undefined &&
        receivedScope !== null &&
        /^(?:local|[a-f0-9]{64})$/u.test(receivedScope) &&
        receivedScope !== expectedScope;
      if ([401, 412].includes(response.status) || changed) {
        handleStatus(changed ? 412 : response.status);
        if (changed) {
          throw new DOMException("The read scope changed", "AbortError");
        }
      } else if (response.status === 403) {
        handleStatus(response.status);
      }
    }
    return response;
  } catch (error) {
    try {
      await response.body?.cancel(error);
    } catch {
      // Preserve the original cancellation/scope failure if the body already errored.
    }
    throw error;
  }
}

/** In-band stream failures use the originating request's session and abort guards. */
export function createSessionWorkspaceServices(
  options: Pick<
    ConsoleWorkspaceServicesOptions,
    "mount" | "signal" | "expectedSubject" | "url" | "origin"
  >
) {
  const statusHandlers = new WeakMap<AbortSignal, (status: number) => void>();
  return createConsoleWorkspaceServices({
    ...options,
    fetch: (input, init) =>
      sessionFetch(
        input,
        { ...init, credentials: "same-origin", cache: "no-store" },
        undefined,
        (handle) => {
          if (init?.signal) {
            statusHandlers.set(init.signal, handle);
          }
        }
      ),
    onStreamError(error, signal) {
      if (error instanceof WorkspaceServiceError && signal && !signal.aborted) {
        statusHandlers.get(signal)?.(error.status);
      }
    },
  });
}
