import {
  Badge,
  ConsolePage,
  DataTable,
  KeyValueList,
  Section,
  SplitView,
  StateView,
  SummaryStrip,
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

      <ConsolePage.Body className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <SummaryStrip>
          <SummaryStrip.Item label="Records" value={summary.total} />
          <SummaryStrip.Item
            label="Latest record"
            value={summary.latestCreatedAt}
          />
          <SummaryStrip.Item label="Surface" value="schema-admin" />
        </SummaryStrip>
        <SplitView>
          <SplitView.Main>
            <Section>
              <Section.Header>
                <Section.Title>Users</Section.Title>
                <Section.Meta>{summary.total} records</Section.Meta>
              </Section.Header>
              {usersQuery.isError ? (
                <StateView
                  description={String(usersQuery.error.message)}
                  title="Users could not be loaded"
                />
              ) : usersQuery.isPending ? (
                <StateView
                  description="Reading the schema-admin surface."
                  title="Loading users"
                />
              ) : userRows.length === 0 ? (
                <StateView
                  description="The Identity module returned no records."
                  title="No users"
                />
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
            </Section>
          </SplitView.Main>
          <SplitView.Inspector>
            <Section>
              <Section.Header>
                <Section.Title>User surface</Section.Title>
                <Section.Meta>{userFields.length} fields</Section.Meta>
              </Section.Header>
              <DataTable>
                <DataTable.Head>
                  <DataTable.Row>
                    <DataTable.Header>Field</DataTable.Header>
                    <DataTable.Header>Type</DataTable.Header>
                  </DataTable.Row>
                </DataTable.Head>
                <DataTable.Body>
                  {userFields.map(([field, type, constraint]) => (
                    <DataTable.Row key={field}>
                      <DataTable.Cell className="font-mono text-xs">
                        {field}
                      </DataTable.Cell>
                      <DataTable.Cell>
                        {type} · {constraint}
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))}
                </DataTable.Body>
              </DataTable>
            </Section>
            <Section>
              <Section.Header>
                <Section.Title>Package contract</Section.Title>
              </Section.Header>
              <KeyValueList>
                {surfaceRows.map(([label, value]) => (
                  <KeyValueList.Row key={label} label={label} value={value} />
                ))}
              </KeyValueList>
            </Section>
            <Section>
              <Section.Header>
                <Section.Title>Execution path</Section.Title>
              </Section.Header>
              <KeyValueList>
                {workflowRows.map(([label, value]) => (
                  <KeyValueList.Row key={label} label={label} value={value} />
                ))}
              </KeyValueList>
            </Section>
          </SplitView.Inspector>
        </SplitView>
      </ConsolePage.Body>
    </ConsolePage>
  );
}
