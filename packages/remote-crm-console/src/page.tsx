import {
  Badge,
  ConsolePage,
  Panel,
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
      <p className="px-3 py-3 text-muted-foreground text-sm">
        Failed to load contacts: {String((error as Error | undefined)?.message)}
      </p>
    );
  }
  if (isPending) {
    return (
      <p className="px-3 py-3 text-muted-foreground text-sm">
        Loading contacts...
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="px-3 py-3 text-muted-foreground text-sm">
        No contacts found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-border border-b text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((contact) => (
            <tr key={contact.id}>
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">
                  {contact.name}
                </div>
                <div className="font-mono text-muted-foreground text-xs">
                  {contact.id}
                </div>
              </td>
              <td className="px-3 py-2 text-foreground">{contact.email}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {contact.company}
              </td>
              <td className="px-3 py-2">
                <span className="border border-border px-2 py-0.5 text-muted-foreground text-xs">
                  {contact.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

      <ConsolePage.Body className="grid gap-3">
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel>
            <Panel.Header>
              <Panel.Title>Contacts</Panel.Title>
              <span className="ml-auto border border-border px-2 py-0.5 text-muted-foreground text-xs">
                {summary.total} records
              </span>
              <span className="border border-border px-2 py-0.5 text-muted-foreground text-xs">
                {summary.active} active
              </span>
              <span className="border border-border px-2 py-0.5 text-muted-foreground text-xs">
                {summary.paused} paused
              </span>
            </Panel.Header>
            <RemoteCrmContactsContent
              error={contactsQuery.error}
              isError={contactsQuery.isError}
              isPending={contactsQuery.isPending}
              rows={contactRows}
            />
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
            <Panel.Title>Host-owned execution path</Panel.Title>
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
};
