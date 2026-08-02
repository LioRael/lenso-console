import type { ConsoleAdminRecord } from "@lenso/console-package-api";

export type AuthProviderId = "github" | "google" | "oidc";

export type AuthProviderRow = {
  id: AuthProviderId;
  label: string;
  moduleName: string;
  route: string;
  consolePath: string;
  surface: string;
  operations: string;
  state: "registered" | "degraded";
  owner: string;
  configuration: readonly string[];
  evidence: readonly string[];
};

export type AuthUserRow = {
  id: string;
  createdAt: string;
  state: string;
  anonymous: string;
};

export type AuthSessionRow = {
  id: string;
  userId: string;
  deviceId: string;
  clientIp: string;
  createdAt: string;
  expiresAt: string;
  state: "active" | "revoked";
};

export type AuthDeviceRow = {
  id: string;
  userId: string;
  lastSeenIp: string;
  trustedAt: string;
  lastSeenAt: string;
};

type AuthModuleMetadata = {
  module_name?: string;
  status?: "loaded" | "error";
};

const authProviderFixtures: readonly AuthProviderRow[] = [
  {
    configuration: ["client_id", "client_secret", "redirect_uri"],
    consolePath: "/data/auth/providers/github",
    evidence: [
      "Routes: auth-github",
      "Effects: provider module",
      "Evidence: runtime",
    ],
    id: "github",
    label: "GitHub",
    moduleName: "auth-github",
    operations: "Start + complete",
    owner: "auth-github",
    route: "/providers/github",
    state: "registered",
    surface: "OAuth Provider",
  },
  {
    configuration: ["client_id", "client_secret", "redirect_uri"],
    consolePath: "/data/auth/providers/google",
    evidence: [
      "Routes: auth-google",
      "Effects: provider module",
      "Evidence: runtime",
    ],
    id: "google",
    label: "Google",
    moduleName: "auth-google",
    operations: "Start + complete",
    owner: "auth-google",
    route: "/providers/google",
    state: "registered",
    surface: "OAuth Provider",
  },
  {
    configuration: ["client_id", "client_secret", "redirect_uri"],
    consolePath: "/data/auth/providers/oidc",
    evidence: [
      "Routes: auth-oidc",
      "Effects: provider module",
      "Evidence: runtime",
    ],
    id: "oidc",
    label: "OIDC Provider",
    moduleName: "auth-oidc",
    operations: "Discovery + token",
    owner: "auth-oidc",
    route: "/providers/oidc",
    state: "registered",
    surface: "OIDC Provider",
  },
] as const;

export function authProviderRows(
  modules: readonly AuthModuleMetadata[]
): AuthProviderRow[] {
  const moduleState = new Map(
    modules.map((module) => [module.module_name, module.status])
  );
  return authProviderFixtures.map((provider) => ({
    ...provider,
    state:
      moduleState.get(provider.moduleName) === "error"
        ? "degraded"
        : provider.state,
  }));
}

export function authProviderById(
  providers: readonly AuthProviderRow[],
  id: AuthProviderId
): AuthProviderRow {
  return providers.find((provider) => provider.id === id) ?? providers[0]!;
}

export function authUserRows(
  records: readonly ConsoleAdminRecord[]
): AuthUserRow[] {
  return records.map((record) => ({
    anonymous: record.is_anonymous === true ? "Anonymous" : "Member",
    createdAt: fieldText(record.created_at),
    id: fieldText(record.id),
    state: record.disabled_at ? "Disabled" : "Active",
  }));
}

export function authSessionRows(
  records: readonly ConsoleAdminRecord[]
): AuthSessionRow[] {
  return records.map((record) => ({
    clientIp: fieldText(record.client_ip),
    createdAt: fieldText(record.created_at),
    deviceId: fieldText(record.device_id),
    expiresAt: fieldText(record.expires_at),
    id: fieldText(record.id),
    state: record.revoked_at ? "revoked" : "active",
    userId: fieldText(record.user_id),
  }));
}

export function authDeviceRows(
  records: readonly ConsoleAdminRecord[]
): AuthDeviceRow[] {
  return records.map((record) => ({
    id: fieldText(record.id),
    lastSeenAt: fieldText(record.updated_at ?? record.created_at),
    lastSeenIp: fieldText(record.last_seen_ip),
    trustedAt: fieldText(record.trusted_at),
    userId: fieldText(record.user_id),
  }));
}

function fieldText(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "-";
}
