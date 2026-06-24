import { LogIn } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "../components/ui/button";
import {
  apiAuthToken,
  consoleAccessTokenStorageKey,
  isApiMode,
  runtimeApiAuthToken,
  runtimeConsoleApiPrefix,
} from "../lib/http-client";

const oidcStateStorageKey = "runtime-console:oidc-state";
const oidcVerifierStorageKey = "runtime-console:oidc-verifier";
const oidcReturnPathStorageKey = "runtime-console:oidc-return-path";

type OidcMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  lenso_console_client_id: string;
};

type OidcTokenResponse = {
  access_token: string;
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
  const isCallback =
    typeof window !== "undefined" &&
    window.location.pathname === consoleOidcCallbackPath();

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

  if (!oidcAuthIsRequired() && !isCallback) {
    return children;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-(--bg-app) px-4 text-(--fg-primary)">
      <section className="w-full max-w-sm rounded-[var(--radius-panel)] border border-(--line) bg-(--bg-panel) p-5 shadow-(--elevation-panel)">
        <div className="space-y-1">
          <h1 className="text-sm font-semibold">Runtime Console</h1>
          <p className="text-xs text-(--fg-secondary)">
            Sign in with the configured Lenso identity provider.
          </p>
        </div>
        {authError ? (
          <p className="mt-4 text-xs text-[var(--tone-error-fg)]">
            {authError}
          </p>
        ) : null}
        <Button className="mt-5 w-full" disabled={busy} onClick={handleSignIn}>
          <LogIn aria-hidden="true" className="size-3.5" />
          {busy ? "Signing in" : "Sign in"}
        </Button>
      </section>
    </main>
  );
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
    throw new Error("Runtime Console API base URL is not configured");
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
