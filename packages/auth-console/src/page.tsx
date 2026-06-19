import { runtimeConsoleHostApi } from "@lenso/runtime-console-api";

import { authUserRows, authUsersSummary } from "./model";

const surfaceRows = [
  ["Module", "auth"],
  ["Package", "@lenso/auth-console"],
  ["Export", "authConsoleModule"],
  ["Route", "/data/auth"],
  ["Capability", "auth.users.read"],
] as const;

const sessionRows = [
  ["Create development session", "POST /v1/auth/dev/sessions"],
  ["Revoke current session", "POST /v1/auth/sessions/revoke"],
] as const;

const AuthUsersContent = ({
  error,
  isError,
  isPending,
  rows,
}: {
  error: unknown;
  isError: boolean;
  isPending: boolean;
  rows: ReturnType<typeof authUserRows>;
}) => {
  if (isError) {
    return (
      <p className="px-3 py-3 text-muted-foreground text-sm">
        Failed to load users: {String((error as Error | undefined)?.message)}
      </p>
    );
  }
  if (isPending) {
    return (
      <p className="px-3 py-3 text-muted-foreground text-sm">
        Loading users...
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="px-3 py-3 text-muted-foreground text-sm">No users found.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-border border-b text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Disabled</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((user) => (
            <tr key={user.id}>
              <td className="px-3 py-2 font-mono text-foreground text-xs">
                {user.id}
              </td>
              <td className="px-3 py-2 font-mono text-muted-foreground text-xs">
                {user.createdAt}
              </td>
              <td className="px-3 py-2 font-mono text-muted-foreground text-xs">
                {user.disabledAt}
              </td>
              <td className="px-3 py-2">
                <span className="border border-border px-2 py-0.5 text-muted-foreground text-xs">
                  {user.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const AuthConsolePage = () => {
  const usersQuery = runtimeConsoleHostApi.adminData.useRecords({
    entityName: "users",
    moduleName: "auth",
  });
  const userRows = authUserRows(usersQuery.data?.data ?? []);
  const summary = authUsersSummary(usersQuery.data?.data ?? []);

  return (
    <main className="flex h-full flex-col gap-4 overflow-auto bg-background p-4">
      <header className="flex flex-wrap items-start gap-3 border-border border-b pb-3">
        <div className="min-w-0">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-normal">
            Module console package
          </p>
          <h1 className="font-semibold text-2xl text-foreground">Auth</h1>
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <span className="border border-border px-2 py-1 text-muted-foreground">
            linked module
          </span>
          <span className="border border-border px-2 py-1 text-muted-foreground">
            schema-admin
          </span>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-border bg-card">
          <div className="flex items-center gap-3 border-border border-b px-3 py-2">
            <h2 className="font-medium text-foreground text-sm">Users</h2>
            <span className="ml-auto border border-border px-2 py-0.5 text-muted-foreground text-xs">
              {summary.total} records
            </span>
            <span className="border border-border px-2 py-0.5 text-muted-foreground text-xs">
              {summary.active} active
            </span>
            <span className="border border-border px-2 py-0.5 text-muted-foreground text-xs">
              {summary.disabled} disabled
            </span>
          </div>
          <AuthUsersContent
            error={usersQuery.error}
            isError={usersQuery.isError}
            isPending={usersQuery.isPending}
            rows={userRows}
          />
        </div>

        <div className="border border-border bg-card">
          <div className="border-border border-b px-3 py-2">
            <h2 className="font-medium text-foreground text-sm">
              Package contract
            </h2>
          </div>
          <dl className="divide-y divide-border">
            {surfaceRows.map(([label, value]) => (
              <div
                className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-3 py-2 text-sm"
                key={label}
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-mono text-foreground text-xs">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border border-border bg-card">
        <div className="border-border border-b px-3 py-2">
          <h2 className="font-medium text-foreground text-sm">Sessions</h2>
        </div>
        <div className="divide-y divide-border">
          {sessionRows.map(([label, route]) => (
            <div
              className="grid grid-cols-[minmax(180px,260px)_minmax(0,1fr)] gap-3 px-3 py-2 text-sm"
              key={route}
            >
              <div className="text-foreground">{label}</div>
              <div className="font-mono text-muted-foreground text-xs">
                {route}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
};
