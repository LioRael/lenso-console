import { consoleApiAuthToken, isApiMode } from "../lib/http-client";
import {
  type ConsoleAdminContext,
  useConsoleAdminContext,
} from "./console-admin-context";

const localConsoleCapabilities = [
  "console.superadmin",
  "console.access.read",
  "console.access.manage",
  "console.users.read",
  "console.users.manage",
  "console.sessions.read",
  "console.sessions.revoke",
  "console.organizations.read",
  "console.organizations.manage",
  "console.managed-service.access-grants.read",
  "console.managed-service.access-grants.manage",
  "runtime.stories.read",
  "auth.users.read",
  "identity.users.read",
  "crm_service.contacts.read",
  "crm_service.contacts.sync",
  "console.system-registry.read",
] as const;

const opaqueApiTokenCapabilities = [
  "runtime.stories.read",
  "auth.users.read",
  "identity.users.read",
] as const;

function normalizedAuthToken(token: string): string {
  return token.startsWith("Bearer ") ? token.slice("Bearer ".length) : token;
}

function isDevelopmentAuthToken(token: string): boolean {
  const normalized = normalizedAuthToken(token);
  return (
    normalized.startsWith("dev-service:") || normalized.startsWith("dev-user:")
  );
}

export function parseDevAuthTokenScopes(token: string): string[] {
  const normalized = normalizedAuthToken(token);
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
    adminContext?: ConsoleAdminContext | undefined;
    apiMode?: boolean;
    authToken?: string | undefined;
  } = {}
): readonly string[] {
  if (options.adminContext) {
    return options.adminContext.capabilities;
  }

  const resolvedApiMode = options.apiMode ?? isApiMode();
  const resolvedAuthToken =
    "authToken" in options ? options.authToken : consoleApiAuthToken();
  if (!resolvedApiMode) {
    return localConsoleCapabilities;
  }
  if (!resolvedAuthToken) {
    return [];
  }
  if (!isDevelopmentAuthToken(resolvedAuthToken)) {
    return opaqueApiTokenCapabilities;
  }
  return parseDevAuthTokenScopes(resolvedAuthToken);
}

export function useConsoleCapabilities(): readonly string[] {
  const adminContextQuery = useConsoleAdminContext();
  const apiMode = isApiMode();
  const authToken = consoleApiAuthToken();

  if (adminContextQuery.data) {
    return adminContextQuery.data.capabilities;
  }

  if (apiMode && authToken && !isDevelopmentAuthToken(authToken)) {
    return [];
  }

  return consoleCapabilityProvider({
    apiMode,
    authToken,
  });
}
