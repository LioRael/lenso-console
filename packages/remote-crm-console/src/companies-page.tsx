import {
  ConsolePage,
  DataTable,
  Panel,
  StatusMarker,
} from "@lenso/console-package-api";

const companies = [
  {
    account: "Enterprise",
    contacts: 18,
    name: "Northstar Labs",
    status: "Synced",
  },
  { account: "Growth", contacts: 7, name: "Acme Systems", status: "Synced" },
  { account: "Starter", contacts: 3, name: "Orbit Goods", status: "Pending" },
];

export const RemoteCrmCompaniesPage = () => (
  <ConsolePage>
    <ConsolePage.Header>
      <ConsolePage.Heading>
        <ConsolePage.Title>Companies</ConsolePage.Title>
        <ConsolePage.Description>
          Company records exposed by the Remote CRM module.
        </ConsolePage.Description>
      </ConsolePage.Heading>
    </ConsolePage.Header>
    <ConsolePage.Body>
      <Panel>
        <Panel.Header>
          <Panel.Title>CRM companies</Panel.Title>
        </Panel.Header>
        <Panel.Content>
          <DataTable>
            <DataTable.Head>
              <DataTable.Row>
                <DataTable.Header>Company</DataTable.Header>
                <DataTable.Header>Account</DataTable.Header>
                <DataTable.Header>Contacts</DataTable.Header>
                <DataTable.Header>State</DataTable.Header>
              </DataTable.Row>
            </DataTable.Head>
            <DataTable.Body>
              {companies.map((company) => (
                <DataTable.Row key={company.name}>
                  <DataTable.Cell>{company.name}</DataTable.Cell>
                  <DataTable.Cell>{company.account}</DataTable.Cell>
                  <DataTable.Cell>{company.contacts}</DataTable.Cell>
                  <DataTable.Cell>
                    <StatusMarker
                      tone={company.status === "Synced" ? "success" : "warning"}
                    >
                      {company.status}
                    </StatusMarker>
                  </DataTable.Cell>
                </DataTable.Row>
              ))}
            </DataTable.Body>
          </DataTable>
        </Panel.Content>
      </Panel>
    </ConsolePage.Body>
  </ConsolePage>
);
