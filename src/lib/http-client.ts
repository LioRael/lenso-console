import ky, { isHTTPError } from "ky";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const consoleMode = import.meta.env.VITE_CONSOLE_MODE as
  | "api"
  | "mock"
  | undefined;
const developmentApiAuthScopes = [
  "runtime.stories.read",
  "auth.users.read",
  "identity.users.read",
  "crm_service.contacts.read",
  "crm_service.contacts.sync",
  "hello-action:greetings:write",
  "console.system-registry.read",
  "console.system.read",
  "console.system.connect",
  "console.workload.read",
  "console.workload.control",
  "console.workload.operation.read",
  "console.module.business.read",
  "console.module.business.write",
  "support_ticket.tickets.read",
  "support_ticket.tickets.write",
] as const;
const developmentApiAuthToken = `dev-service:admin:${developmentApiAuthScopes.join(",")}`;
export const apiAuthToken =
  (import.meta.env.VITE_API_AUTH_TOKEN as string | undefined) ??
  (import.meta.env.DEV ? developmentApiAuthToken : undefined);
export const consoleAccessTokenStorageKey = "lenso-console:access-token";

type ConsoleAccessTokenListener = () => void;

const consoleAccessTokenListeners = new Set<ConsoleAccessTokenListener>();

function emitConsoleAccessTokenChange() {
  for (const listener of consoleAccessTokenListeners) {
    listener();
  }
}

export function storedConsoleAccessToken() {
  return typeof window === "undefined"
    ? undefined
    : (window.localStorage.getItem(consoleAccessTokenStorageKey) ?? undefined);
}

export function consoleApiAuthToken() {
  return apiAuthToken ?? storedConsoleAccessToken();
}

export function subscribeConsoleAccessToken(
  listener: ConsoleAccessTokenListener
) {
  consoleAccessTokenListeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === consoleAccessTokenStorageKey) {
      listener();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    consoleAccessTokenListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function storeConsoleAccessToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(consoleAccessTokenStorageKey, token);
  emitConsoleAccessTokenChange();
}

export function invalidateStoredConsoleAccessToken() {
  if (
    typeof window === "undefined" ||
    !window.localStorage.getItem(consoleAccessTokenStorageKey)
  ) {
    return;
  }
  window.localStorage.removeItem(consoleAccessTokenStorageKey);
  emitConsoleAccessTokenChange();
}

export function consoleApiPrefix(value = apiBaseUrl) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed === "/" ? "/" : trimmed.replace(/\/+$/, "");
}

export function isApiMode() {
  return consoleMode === "api" && Boolean(consoleApiPrefix());
}

export function consoleDataSource() {
  return isApiMode() ? "api" : "mock";
}

export function lensoApiErrorMessage(body: unknown): string | undefined {
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
  return undefined;
}

const consoleApiPrefixValue = consoleApiPrefix();

export const httpClient = ky.create({
  ...(consoleApiPrefixValue ? { prefix: consoleApiPrefixValue } : {}),
  hooks: {
    beforeRequest: [
      ({ request }) => {
        request.headers.set("Accept", "application/json");
        const token = consoleApiAuthToken();
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`);
        }
      },
    ],
    afterResponse: [
      ({ response }) => {
        if (response.status === 401) {
          invalidateStoredConsoleAccessToken();
        }
      },
    ],
    beforeError: [
      async ({ error }) => {
        if (!isHTTPError(error)) {
          return error;
        }

        const body = await error.response.json().catch(() => undefined);
        const message = lensoApiErrorMessage(body);
        if (message) {
          error.message = message;
        }
        return error;
      },
    ],
  },
});
