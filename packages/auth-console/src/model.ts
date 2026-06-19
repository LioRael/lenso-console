import type { ConsoleAdminRecord } from "@lenso/runtime-console-api";

export type AuthUserRow = {
  createdAt: string;
  disabledAt: string;
  id: string;
  status: "active" | "disabled";
};

export type AuthUsersSummary = {
  active: number;
  disabled: number;
  total: number;
};

export type AuthSessionRow = {
  createdAt: string;
  expiresAt: string;
  id: string;
  revokedAt: string;
  status: "active" | "expired" | "revoked";
  userId: string;
};

export type AuthSessionsSummary = {
  active: number;
  expired: number;
  revoked: number;
  total: number;
};

const fieldText = (value: unknown): string =>
  typeof value === "string" && value.length > 0 ? value : "-";

export const authUserRows = (
  records: readonly ConsoleAdminRecord[]
): AuthUserRow[] =>
  records.map((record) => {
    const disabledAt = fieldText(record.disabled_at);
    return {
      createdAt: fieldText(record.created_at),
      disabledAt,
      id: fieldText(record.id),
      status: disabledAt === "-" ? "active" : "disabled",
    };
  });

export const authUsersSummary = (
  records: readonly ConsoleAdminRecord[]
): AuthUsersSummary => {
  const summary: AuthUsersSummary = { active: 0, disabled: 0, total: 0 };
  for (const row of authUserRows(records)) {
    summary.total += 1;
    summary[row.status] += 1;
  }
  return summary;
};

export const authSessionRows = (
  records: readonly ConsoleAdminRecord[],
  now = new Date()
): AuthSessionRow[] =>
  records.map((record) => {
    const revokedAt = fieldText(record.revoked_at);
    const expiresAt = fieldText(record.expires_at);
    return {
      createdAt: fieldText(record.created_at),
      expiresAt,
      id: fieldText(record.id),
      revokedAt,
      status: sessionStatus(expiresAt, revokedAt, now),
      userId: fieldText(record.user_id),
    };
  });

export const authSessionsSummary = (
  records: readonly ConsoleAdminRecord[],
  now = new Date()
): AuthSessionsSummary => {
  const summary: AuthSessionsSummary = {
    active: 0,
    expired: 0,
    revoked: 0,
    total: 0,
  };
  for (const row of authSessionRows(records, now)) {
    summary.total += 1;
    summary[row.status] += 1;
  }
  return summary;
};

function sessionStatus(
  expiresAt: string,
  revokedAt: string,
  now: Date
): AuthSessionRow["status"] {
  if (revokedAt !== "-") {
    return "revoked";
  }
  const expiresMs = Date.parse(expiresAt);
  return Number.isFinite(expiresMs) && expiresMs <= now.getTime()
    ? "expired"
    : "active";
}
