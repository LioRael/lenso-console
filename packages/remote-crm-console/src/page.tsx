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

import { remoteCrmContactRows, remoteCrmContactsSummary } from "./model";

const surfaceRows = [
  ["Module", "remote-crm"],
  ["Package", "@lenso/remote-crm-console"],
  ["Export", "remoteCrmConsoleModule"],
  ["Route", "/data/remote-crm"],
  ["Capability", "remote_crm.contacts.read"],
] as const;

const workflowRows = [
  ["Manifest", "remote module declares this ConsoleSurface"],
  ["Data", "contacts are read through host schema-admin"],
  ["Runtime", "remote_crm.sync_contact.v1 runs through host worker queues"],
] as const;

const RemoteCrmContactsContent = ({
  error,
  isError,
  isPending,
  rows,
}: {
  error: unknown;
  isError: boolean;
  isPending: boolean;
  rows: ReturnType<typeof remoteCrmContactRows>;
}) => {
  if (isError) {
    return (
      <StateView
        description={String((error as Error | undefined)?.message)}
        title="Contacts could not be loaded"
      />
    );
  }
  if (isPending) {
    return (
      <StateView
        description="Reading the schema-admin surface."
        title="Loading contacts"
      />
    );
  }
  if (rows.length === 0) {
    return (
      <StateView
        description="The CRM Service returned no records."
        title="No contacts"
      />
    );
  }

  return (
    <DataTable className="min-w-[680px]">
      <DataTable.Head>
        <DataTable.Row>
          <DataTable.Header>Contact</DataTable.Header>
          <DataTable.Header>Email</DataTable.Header>
          <DataTable.Header>Company</DataTable.Header>
          <DataTable.Header>Status</DataTable.Header>
        </DataTable.Row>
      </DataTable.Head>
      <DataTable.Body>
        {rows.map((contact) => (
          <DataTable.Row key={contact.id}>
            <DataTable.Cell>
              <div className="font-medium text-foreground">{contact.name}</div>
              <div className="font-mono text-muted-foreground text-xs">
                {contact.id}
              </div>
            </DataTable.Cell>
            <DataTable.Cell className="text-foreground">
              {contact.email}
            </DataTable.Cell>
            <DataTable.Cell>{contact.company}</DataTable.Cell>
            <DataTable.Cell>
              <Badge>{contact.status}</Badge>
            </DataTable.Cell>
          </DataTable.Row>
        ))}
      </DataTable.Body>
    </DataTable>
  );
};

export const RemoteCrmConsolePage = () => {
  const contactsQuery = consoleHostApi.adminData.useRecords({
    entityName: "contacts",
    moduleName: "remote-crm",
  });
  const contactRows = remoteCrmContactRows(contactsQuery.data?.data ?? []);
  const summary = remoteCrmContactsSummary(contactsQuery.data?.data ?? []);

  return (
    <ConsolePage className="h-full">
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>Remote CRM</ConsolePage.Title>
          <ConsolePage.Description>
            Contacts exposed by the remote CRM Service through the host-owned
            schema-admin capability.
          </ConsolePage.Description>
        </ConsolePage.Heading>
        <ConsolePage.Actions>
          <Badge>remote Service</Badge>
          <Badge>host rendered</Badge>
        </ConsolePage.Actions>
      </ConsolePage.Header>

      <ConsolePage.Body className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <SummaryStrip>
          <SummaryStrip.Item label="Records" value={summary.total} />
          <SummaryStrip.Item
            label="Active"
            tone="success"
            value={summary.active}
          />
          <SummaryStrip.Item
            label="Paused"
            tone="warning"
            value={summary.paused}
          />
        </SummaryStrip>
        <SplitView>
          <SplitView.Main>
            <Section>
              <Section.Header>
                <Section.Title>Contacts</Section.Title>
                <Section.Meta>{summary.total} records</Section.Meta>
              </Section.Header>
              <RemoteCrmContactsContent
                error={contactsQuery.error}
                isError={contactsQuery.isError}
                isPending={contactsQuery.isPending}
                rows={contactRows}
              />
            </Section>
          </SplitView.Main>
          <SplitView.Inspector>
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
};
