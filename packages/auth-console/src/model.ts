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
