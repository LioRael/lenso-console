import ky, { isHTTPError } from "ky";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const runtimeConsoleMode = import.meta.env.VITE_RUNTIME_CONSOLE_MODE as
  | "api"
  | "mock"
  | undefined;
const developmentApiAuthScopes = [
  "runtime.stories.read",
  "identity.users.read",
  "remote_crm.contacts.read",
  "remote_crm.contacts.sync",
  "hello-action:greetings:write",
] as const;
const developmentApiAuthToken = `dev-service:admin:${developmentApiAuthScopes.join(",")}`;
export const apiAuthToken =
  (import.meta.env.VITE_API_AUTH_TOKEN as string | undefined) ??
  (import.meta.env.DEV ? developmentApiAuthToken : undefined);

export function runtimeConsoleApiPrefix(value = apiBaseUrl) {
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
  return runtimeConsoleMode === "api" && Boolean(runtimeConsoleApiPrefix());
}

export function runtimeConsoleDataSource() {
  return isApiMode() ? "api" : "mock";
}

const runtimeConsolePrefix = runtimeConsoleApiPrefix();

export const httpClient = ky.create({
  ...(runtimeConsolePrefix ? { prefix: runtimeConsolePrefix } : {}),
  hooks: {
    beforeRequest: [
      ({ request }) => {
        request.headers.set("Accept", "application/json");
        if (apiAuthToken) {
          request.headers.set("Authorization", `Bearer ${apiAuthToken}`);
        }
      },
    ],
    beforeError: [
      async ({ error }) => {
        if (!isHTTPError(error)) {
          return error;
        }

        const body = await error.response.json().catch(() => undefined);
        if (
          body &&
          typeof body === "object" &&
          "error" in body &&
          body.error &&
          typeof body.error === "object" &&
          "message" in body.error
        ) {
          error.message = String(body.error.message);
        }
        return error;
      },
    ],
  },
});
