import ky, { isHTTPError } from "ky";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const consoleMode = import.meta.env.VITE_CONSOLE_MODE as
  | "api"
  | "mock"
  | undefined;

export function consoleApiPrefix(value = apiBaseUrl) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed === "/" ? "/" : trimmed.replace(/\/+$/, "");
}

export function isApiMode() {
  return consoleMode === "api" && Boolean(consoleApiPrefix());
}

export function lensoApiErrorMessage(body: unknown): string | undefined {
  if (
    body &&
    typeof body === "object" &&
    "detail" in body &&
    typeof body.detail === "string"
  ) {
    return body.detail;
  }
  return undefined;
}

const consoleApiPrefixValue = consoleApiPrefix();

export const httpClient = ky.create({
  ...(consoleApiPrefixValue ? { prefix: consoleApiPrefixValue } : {}),
  hooks: {
    beforeRequest: [
      ({ request }) => request.headers.set("Accept", "application/json"),
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
