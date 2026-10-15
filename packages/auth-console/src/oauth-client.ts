export type OAuthConsentView = {
  requestId: string;
  client: { id: string; name: string };
  resource: string;
  scopes: readonly string[];
  expiresAt: number;
};
export type OAuthConnectedApplication = {
  id: string;
  clientId: string;
  clientName: string;
  subjectId: string;
  resource: string;
  scopes: readonly string[];
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
};
export interface OAuthConsoleClient {
  consent(requestId: string, signal: AbortSignal): Promise<OAuthConsentView>;
  decide(
    requestId: string,
    approve: boolean,
    signal: AbortSignal
  ): Promise<{ redirect: string }>;
  grants(signal: AbortSignal): Promise<readonly OAuthConnectedApplication[]>;
  revoke(id: string, signal: AbortSignal): Promise<void>;
}

/** The existing Console host supplies its fenced session transport. This adapter
 * never stores credentials, tokens or grants in a global/browser read cache. */
export function createOAuthConsoleClient(options: {
  basePath: string;
  fetch(input: string, init: RequestInit): Promise<Response>;
  isCurrent(): boolean;
}): OAuthConsoleClient {
  if (!/^\/[A-Za-z0-9/_-]+$/.test(options.basePath)) {
    throw new TypeError("OAuth API requires a same-origin base path");
  }
  const active = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!options.isCurrent()) {
      throw new DOMException("Console identity changed", "AbortError");
    }
  };
  async function call(path: string, signal: AbortSignal, input?: unknown) {
    active(signal);
    const response = await options.fetch(options.basePath + path, {
      signal,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      ...(input === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          }),
    });
    active(signal);
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "Login required"
          : response.status === 403
            ? "Access denied or Console identity changed"
            : "Authorization request failed; inspect current state before retrying"
      );
    }
    const value = await response.json();
    active(signal);
    return value;
  }
  return {
    consent: (requestId, signal) =>
      call(`/consent?request_id=${encodeURIComponent(requestId)}`, signal),
    async decide(requestId, approve, signal) {
      const value = await call("/decision", signal, { requestId, approve });
      const url = new URL(value.redirect);
      if (
        url.username ||
        url.password ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["127.0.0.1", "[::1]"].includes(url.hostname)
          ))
      ) {
        throw new Error("Invalid OAuth callback");
      }
      return { redirect: url.href };
    },
    grants: (signal) => call("/grants", signal),
    async revoke(id, signal) {
      await call("/grants/revoke", signal, { id });
    },
  };
}
