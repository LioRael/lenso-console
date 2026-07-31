import {
  Badge,
  ConsolePage,
  DataTable,
  Panel,
  consoleHostApi,
} from "@lenso/console-package-api";

import { identityUserRows, identityUsersSummary } from "./model";

const surfaceRows = [
  ["Module", "identity"],
  ["Package", "@lenso/identity-console"],
  ["Export", "identityConsoleModule"],
  ["Route", "/data/identity"],
  ["Capability", "identity.users.read"],
] as const;

const userFields = [
  ["id", "String", "required"],
  ["email", "String", "required"],
  ["display_name", "String", "nullable"],
  ["created_at", "Timestamp", "required"],
  ["updated_at", "Timestamp", "required"],
] as const;

const workflowRows = [
  ["Schema", "Identity exposes Users through schema-admin"],
  ["Runtime", "identity.cleanup_expired_sessions.v1 is declared"],
  ["Stories", "registration and current-user routes carry story labels"],
] as const;

export function IdentityConsolePage() {
  const usersQuery = consoleHostApi.adminData.useRecords({
    entityName: "users",
    moduleName: "identity",
  });
  const userRows = identityUserRows(usersQuery.data?.data ?? []);
  const summary = identityUsersSummary(usersQuery.data?.data ?? []);

  return (
    <ConsolePage className="h-full">
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>Identity</ConsolePage.Title>
          <ConsolePage.Description>
            Users exposed by the linked Identity module through the shared
            schema-admin host capability.
          </ConsolePage.Description>
        </ConsolePage.Heading>
        <ConsolePage.Actions>
          <Badge>linked module</Badge>
          <Badge>schema-admin</Badge>
        </ConsolePage.Actions>
      </ConsolePage.Header>

      <ConsolePage.Body className="grid gap-3">
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel>
            <Panel.Header>
              <Panel.Title>User surface</Panel.Title>
            </Panel.Header>
            <DataTable className="min-w-[560px]">
              <DataTable.Head>
                <DataTable.Row>
                  <DataTable.Header>Field</DataTable.Header>
                  <DataTable.Header>Type</DataTable.Header>
                  <DataTable.Header>Constraint</DataTable.Header>
                </DataTable.Row>
              </DataTable.Head>
              <DataTable.Body>
                {userFields.map(([field, type, constraint]) => (
                  <DataTable.Row key={field}>
                    <DataTable.Cell className="font-mono text-foreground text-xs">
                      {field}
                    </DataTable.Cell>
                    <DataTable.Cell>{type}</DataTable.Cell>
                    <DataTable.Cell>{constraint}</DataTable.Cell>
                  </DataTable.Row>
                ))}
              </DataTable.Body>
            </DataTable>
          </Panel>

          <Panel>
            <Panel.Header>
              <Panel.Title>Package contract</Panel.Title>
            </Panel.Header>
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
          </Panel>
        </section>

        <Panel>
          <Panel.Header>
            <Panel.Title>Users</Panel.Title>
            <div className="flex gap-2">
              <Badge>{summary.total} records</Badge>
              <Badge>latest {summary.latestCreatedAt}</Badge>
            </div>
          </Panel.Header>
          {usersQuery.isError ? (
            <Panel.Content padding="sm">
              Failed to load users: {String(usersQuery.error.message)}
            </Panel.Content>
          ) : usersQuery.isPending ? (
            <Panel.Content padding="sm">Loading users…</Panel.Content>
          ) : userRows.length === 0 ? (
            <Panel.Content padding="sm">No users found.</Panel.Content>
          ) : (
            <DataTable className="min-w-[720px]">
              <DataTable.Head>
                <DataTable.Row>
                  <DataTable.Header>ID</DataTable.Header>
                  <DataTable.Header>Email</DataTable.Header>
                  <DataTable.Header>Display name</DataTable.Header>
                  <DataTable.Header>Created</DataTable.Header>
                  <DataTable.Header>Updated</DataTable.Header>
                </DataTable.Row>
              </DataTable.Head>
              <DataTable.Body>
                {userRows.map((user) => (
                  <DataTable.Row key={user.id}>
                    <DataTable.Cell className="font-mono text-foreground text-xs">
                      {user.id}
                    </DataTable.Cell>
                    <DataTable.Cell className="text-foreground">
                      {user.email}
                    </DataTable.Cell>
                    <DataTable.Cell>{user.displayName}</DataTable.Cell>
                    <DataTable.Cell className="font-mono text-xs">
                      {user.createdAt}
                    </DataTable.Cell>
                    <DataTable.Cell className="font-mono text-xs">
                      {user.updatedAt}
                    </DataTable.Cell>
                  </DataTable.Row>
                ))}
              </DataTable.Body>
            </DataTable>
          )}
        </Panel>

        <Panel>
          <Panel.Header>
            <Panel.Title>Module lifecycle links</Panel.Title>
          </Panel.Header>
          <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {workflowRows.map(([label, value]) => (
              <div className="min-w-0 px-3 py-3" key={label}>
                <div className="font-medium text-foreground text-sm">
                  {label}
                </div>
                <div className="mt-1 text-muted-foreground text-xs">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </ConsolePage.Body>
    </ConsolePage>
  );
}
