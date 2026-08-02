import { LogIn } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "../../packages/console-ui-internal/src/index";
import {
  apiAuthToken,
  consoleAccessTokenStorageKey,
  isApiMode,
  runtimeApiAuthToken,
  runtimeConsoleApiPrefix,
} from "../lib/http-client";

const oidcStateStorageKey = "lenso-console:oidc-state";
const oidcVerifierStorageKey = "lenso-console:oidc-verifier";
const oidcReturnPathStorageKey = "lenso-console:oidc-return-path";

type OidcMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  lenso_console_client_id: string;
};

type OidcTokenResponse = {
  access_token: string;
};

type PasswordLoginInput = {
  identifier: string;
  password: string;
};

type PasswordSessionResponse = {
  token: string;
};

const consoleBootstrapStatusSchema =
  "lenso.console-bootstrap-status.v1" as const;

export type ConsoleBootstrapStatus = {
  schema: typeof consoleBootstrapStatusSchema;
  status: "operator_required" | "ready";
  nextAction: string;
};

export function consoleOidcCallbackPath(baseUrl = import.meta.env.BASE_URL) {
  const basePath = baseUrl.replace(/\/+$/, "");
  const normalizedBasePath =
    basePath && !basePath.startsWith("/") ? `/${basePath}` : basePath;
  return `${normalizedBasePath || ""}/oidc/callback`;
}

export function consoleOidcRedirectUri(
  location: Pick<Location, "origin"> = window.location,
  baseUrl = import.meta.env.BASE_URL
) {
  return `${location.origin}${consoleOidcCallbackPath(baseUrl)}`;
}

export function base64UrlNoPadding(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function oidcAuthIsRequired() {
  return isApiMode() && !runtimeApiAuthToken();
}

export function ConsoleAuthGate({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [passwordAuthenticated, setPasswordAuthenticated] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<
    ConsoleBootstrapStatus | "checking" | "unavailable"
  >("checking");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const isCallback =
    typeof window !== "undefined" &&
    window.location.pathname === consoleOidcCallbackPath();

  useEffect(() => {
    if (!oidcAuthIsRequired() || isCallback) {
      return;
    }
    let active = true;
    void inspectBootstrapStatus();

    async function inspectBootstrapStatus() {
      try {
        const response = await fetch(consoleBootstrapStatusUrl(), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error("Console bootstrap status is unavailable");
        }
        const status = decodeConsoleBootstrapStatus(await response.json());
        if (active) {
          setBootstrapStatus(status);
        }
      } catch {
        if (active) {
          setBootstrapStatus("unavailable");
        }
      }
    }

    return () => {
      active = false;
    };
  }, [isCallback]);

  async function handleSignIn() {
    setBusy(true);
    setAuthError(null);
    try {
      await beginConsoleOidcLogin();
    } catch (error: unknown) {
      setBusy(false);
      setAuthError(
        error instanceof Error ? error.message : "OIDC login failed"
      );
    }
  }

  async function handlePasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAuthError(null);
    try {
      const token = await loginWithPassword({
        identifier: identifier.trim(),
        password,
      });
      window.localStorage.setItem(consoleAccessTokenStorageKey, token);
      setPasswordAuthenticated(true);
    } catch (error: unknown) {
      setBusy(false);
      setAuthError(
        error instanceof Error ? error.message : "Password login failed"
      );
    }
  }

  useEffect(() => {
    if (!isCallback) {
      return;
    }

    setBusy(true);
    void handleCallback();

    async function handleCallback() {
      try {
        await completeConsoleOidcLogin();
      } catch (error: unknown) {
        setBusy(false);
        setAuthError(
          error instanceof Error ? error.message : "OIDC login failed"
        );
      }
    }
  }, [isCallback]);

  if ((!oidcAuthIsRequired() || passwordAuthenticated) && !isCallback) {
    return children;
  }

  if (bootstrapStatus === "checking" && !isCallback) {
    return (
      <main className="grid min-h-screen place-items-center bg-(--bg-app) px-4 text-(--fg-primary)">
        <p className="text-xs text-(--fg-secondary)">
          Inspecting Console bootstrap status…
        </p>
      </main>
    );
  }

  if (
    bootstrapStatus !== "checking" &&
    bootstrapStatus !== "unavailable" &&
    bootstrapStatus.status === "operator_required" &&
    !isCallback
  ) {
    return <ConsoleOperatorBootstrapRequired status={bootstrapStatus} />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-(--bg-app) px-4 text-(--fg-primary)">
      <section className="w-full max-w-sm rounded-[var(--radius-panel)] border border-(--line) bg-(--bg-panel) p-5 shadow-(--elevation-panel)">
        <div className="space-y-1">
          <h1 className="text-sm font-semibold">Lenso Console</h1>
          <p className="text-xs text-(--fg-secondary)">
            Sign in with the configured Lenso identity provider.
          </p>
        </div>
        {authError ? (
          <p className="mt-4 text-xs text-[var(--tone-error-fg)]">
            {authError}
          </p>
        ) : null}
        <form className="mt-5 grid gap-3" onSubmit={handlePasswordSignIn}>
          <label className="grid gap-1.5 text-xs font-medium text-(--fg-secondary)">
            <span>Identifier</span>
            <input
              aria-label="Identifier"
              autoComplete="username"
              className="h-9 rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-3 text-sm text-(--fg-primary) outline-none transition-colors placeholder:text-(--fg-tertiary) focus:border-(--accent) focus:bg-(--bg-control-hover) focus-visible:outline-2 focus-visible:outline-(--focus-ring) focus-visible:outline-offset-1"
              onChange={(event) => setIdentifier(event.target.value)}
              required
              value={identifier}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-(--fg-secondary)">
            <span>Password</span>
            <input
              aria-label="Password"
              autoComplete="current-password"
              className="h-9 rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-3 text-sm text-(--fg-primary) outline-none transition-colors placeholder:text-(--fg-tertiary) focus:border-(--accent) focus:bg-(--bg-control-hover) focus-visible:outline-2 focus-visible:outline-(--focus-ring) focus-visible:outline-offset-1"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <Button className="w-full" disabled={busy} type="submit">
            <LogIn aria-hidden="true" className="size-3.5" />
            {busy ? "Signing in" : "Sign in"}
          </Button>
        </form>
        <Button
          className="mt-2 w-full"
          disabled={busy}
          onClick={handleSignIn}
          variant="ghost"
        >
          Continue with existing session
        </Button>
      </section>
    </main>
  );
}

function ConsoleOperatorBootstrapRequired({
  status,
}: {
  status: ConsoleBootstrapStatus;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-(--bg-app) px-4 text-(--fg-primary)">
      <section className="w-full max-w-lg rounded-[var(--radius-panel)] border border-(--line) bg-(--bg-panel) p-5 shadow-(--elevation-panel)">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--fg-tertiary)">
          Console Bootstrap
        </p>
        <h1 className="mt-1 text-lg font-semibold">Operator required</h1>
        <p className="mt-2 text-sm text-(--fg-secondary)">
          This Console has no operator yet. Run the installation-authority
          command below, then restart the Console Service.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) p-3 text-xs text-(--fg-primary)">
          <code>{`lenso console operator bootstrap \\\n+  --console-url ${window.location.origin} \\\n+  --identifier admin@example.com`}</code>
        </pre>
        <p className="mt-3 text-xs text-(--fg-tertiary)">{status.nextAction}</p>
      </section>
    </main>
  );
}

export function consolePasswordLoginUrl(
  prefix = runtimeConsoleApiPrefix()
): string {
  if (!prefix) {
    throw new Error("Lenso Console API base URL is not configured");
  }
  return `${prefix === "/" ? "" : prefix}/v1/auth/password/login`;
}

export function consoleBootstrapStatusUrl(
  prefix = runtimeConsoleApiPrefix()
): string {
  if (!prefix) {
    throw new Error("Lenso Console API base URL is not configured");
  }
  return `${prefix === "/" ? "" : prefix}/bootstrap/v1/status`;
}

export function decodeConsoleBootstrapStatus(
  value: unknown
): ConsoleBootstrapStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Console bootstrap status must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== consoleBootstrapStatusSchema) {
    throw new TypeError("Console bootstrap status schema is not supported");
  }
  if (record.status !== "operator_required" && record.status !== "ready") {
    throw new TypeError("Console bootstrap status is not supported");
  }
  if (typeof record.nextAction !== "string" || !record.nextAction) {
    throw new TypeError("Console bootstrap next action is required");
  }
  return {
    schema: record.schema,
    status: record.status,
    nextAction: record.nextAction,
  };
}

export function passwordLoginBody(input: PasswordLoginInput): string {
  return JSON.stringify(input);
}

export function decodePasswordSessionToken(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Password login response token is invalid");
  }
  const { token } = value as Partial<PasswordSessionResponse>;
  if (typeof token !== "string" || !token) {
    throw new TypeError("Password login response token is invalid");
  }
  return token;
}

async function loginWithPassword(input: PasswordLoginInput): Promise<string> {
  const response = await fetch(consolePasswordLoginUrl(), {
    body: passwordLoginBody(input),
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      await responseErrorMessage(response, "Password login failed")
    );
  }
  return decodePasswordSessionToken(await response.json());
}

async function beginConsoleOidcLogin() {
  const metadata = await fetchOidcMetadata();
  const verifier = randomPkceValue(32);
  const state = randomPkceValue(16);
  const codeChallenge = await pkceS256Challenge(verifier);
  const redirectUri = consoleOidcRedirectUri();
  const authorizationUrl = new URL(metadata.authorization_endpoint);

  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set(
    "client_id",
    metadata.lenso_console_client_id
  );
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", "openid");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  window.sessionStorage.setItem(oidcStateStorageKey, state);
  window.sessionStorage.setItem(oidcVerifierStorageKey, verifier);
  window.sessionStorage.setItem(
    oidcReturnPathStorageKey,
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
  window.location.assign(authorizationUrl.toString());
}

async function completeConsoleOidcLogin() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) {
    throw new Error(error);
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = window.sessionStorage.getItem(oidcStateStorageKey);
  const verifier = window.sessionStorage.getItem(oidcVerifierStorageKey);
  if (
    !(code && state && expectedState && verifier) ||
    state !== expectedState
  ) {
    throw new Error("OIDC callback state is invalid");
  }

  const metadata = await fetchOidcMetadata();
  const body = new URLSearchParams({
    client_id: metadata.lenso_console_client_id,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: consoleOidcRedirectUri(),
  });
  const response = await fetch(metadata.token_endpoint, {
    body,
    credentials: "include",
    headers: { Accept: "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("OIDC token exchange failed");
  }

  const token = (await response.json()) as OidcTokenResponse;
  if (!token.access_token) {
    throw new Error("OIDC token response is invalid");
  }

  window.localStorage.setItem(consoleAccessTokenStorageKey, token.access_token);
  const returnPath =
    window.sessionStorage.getItem(oidcReturnPathStorageKey) || "/";
  window.sessionStorage.removeItem(oidcStateStorageKey);
  window.sessionStorage.removeItem(oidcVerifierStorageKey);
  window.sessionStorage.removeItem(oidcReturnPathStorageKey);
  window.location.assign(returnPath);
}

async function fetchOidcMetadata() {
  const prefix = runtimeConsoleApiPrefix();
  if (!prefix) {
    throw new Error("Lenso Console API base URL is not configured");
  }
  const response = await fetch(
    `${prefix === "/" ? "" : prefix}/.well-known/openid-configuration`,
    {
      headers: {
        Accept: "application/json",
        ...(apiAuthToken ? { Authorization: `Bearer ${apiAuthToken}` } : {}),
      },
    }
  );
  if (!response.ok) {
    throw new Error("OIDC provider is not available");
  }
  return (await response.json()) as OidcMetadata;
}

async function responseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => undefined);
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error
  ) {
    return String(body.error.message);
  }
  return fallback;
}

async function pkceS256Challenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64UrlNoPadding(new Uint8Array(digest));
}

function randomPkceValue(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlNoPadding(bytes);
}
