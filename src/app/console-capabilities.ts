import { isApiMode, runtimeApiAuthToken } from "../lib/http-client";

const localConsoleCapabilities = [
  "runtime.stories.read",
  "auth.users.read",
  "identity.users.read",
] as const;

export function parseDevAuthTokenScopes(token: string): string[] {
  const normalized = token.startsWith("Bearer ")
    ? token.slice("Bearer ".length)
    : token;
  const serviceToken = normalized.startsWith("dev-service:")
    ? normalized.slice("dev-service:".length)
    : normalized.startsWith("dev-user:")
      ? normalized.slice("dev-user:".length)
      : normalized;
  const scopeSeparator = serviceToken.indexOf(":");
  if (scopeSeparator === -1) {
    return [];
  }
  const rawScopes = serviceToken.slice(scopeSeparator + 1);
  return rawScopes.split(",").filter((scope) => scope.length > 0);
}

export function consoleCapabilityProvider(
  options: {
    apiMode?: boolean;
    authToken?: string | undefined;
  } = {}
): readonly string[] {
  const resolvedApiMode = options.apiMode ?? isApiMode();
  const resolvedAuthToken =
    "authToken" in options ? options.authToken : runtimeApiAuthToken();
  if (!resolvedApiMode) {
    return localConsoleCapabilities;
  }
  if (!resolvedAuthToken) {
    return [];
  }
  return parseDevAuthTokenScopes(resolvedAuthToken);
}

export function useConsoleCapabilities(): readonly string[] {
  return consoleCapabilityProvider();
}
