import { apiAuthToken, isApiMode } from "../lib/http-client";

const localConsoleCapabilities = [
  "runtime.stories.read",
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
  const [, rawScopes] = serviceToken.split(":", 2);
  if (!rawScopes) {
    return [];
  }
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
    "authToken" in options ? options.authToken : apiAuthToken;
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
