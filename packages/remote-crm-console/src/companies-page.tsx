import {
  ConsolePage,
  DataTable,
  KeyValueList,
  Section,
  SplitView,
  StateView,
  StatusMarker,
  consoleHostApi,
  useConsoleLocale,
} from "@lenso/console-package-api";

const stringValue = (value: unknown) =>
  typeof value === "string" ? value : "";

const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const companyRow = (record: Record<string, unknown>) => {
  const id =
    stringValue(record.id) || stringValue(record.company_id) || "company";
  const status = stringValue(record.status) || "Unknown";
  return {
    account: stringValue(record.account) || stringValue(record.tier) || "—",
    contacts:
      numberValue(record.contacts) ?? numberValue(record.contact_count) ?? 0,
    id,
    name: stringValue(record.name) || stringValue(record.company_name) || id,
    status,
    synced: ["active", "ready", "synced"].includes(status.toLowerCase()),
  };
};

type CompanyRow = ReturnType<typeof companyRow>;

const CompaniesContent = ({
  error,
  isError,
  isPending,
  rows,
  zh,
}: {
  error: unknown;
  isError: boolean;
  isPending: boolean;
  rows: CompanyRow[];
  zh: boolean;
}) => {
  if (isPending) {
    return (
      <StateView
        description={
          zh
            ? "正在读取 schema-admin 页面。"
            : "Reading the schema-admin surface."
        }
        title={zh ? "正在加载公司" : "Loading companies"}
      />
    );
  }
  if (isError) {
    return (
      <StateView
        description={String(error)}
        title={zh ? "公司加载失败" : "Companies could not be loaded"}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <StateView
        description={
          zh
            ? "CRM 服务未返回任何记录。"
            : "The CRM Service returned no records."
        }
        title={zh ? "暂无公司" : "No companies"}
      />
    );
  }
  return (
    <DataTable>
      <DataTable.Head>
        <DataTable.Row>
          <DataTable.Header>{zh ? "公司" : "Company"}</DataTable.Header>
          <DataTable.Header>{zh ? "账户" : "Account"}</DataTable.Header>
          <DataTable.Header>{zh ? "联系人" : "Contacts"}</DataTable.Header>
          <DataTable.Header>{zh ? "状态" : "State"}</DataTable.Header>
        </DataTable.Row>
      </DataTable.Head>
      <DataTable.Body>
        {rows.map((company) => (
          <DataTable.Row key={company.id}>
            <DataTable.Cell>
              <div className="font-medium text-foreground">{company.name}</div>
              <div className="font-mono text-muted-foreground text-xs">
                {company.id}
              </div>
            </DataTable.Cell>
            <DataTable.Cell>{company.account}</DataTable.Cell>
            <DataTable.Cell>{company.contacts}</DataTable.Cell>
            <DataTable.Cell>
              <StatusMarker tone={company.synced ? "success" : "warning"}>
                {company.status}
              </StatusMarker>
            </DataTable.Cell>
          </DataTable.Row>
        ))}
      </DataTable.Body>
    </DataTable>
  );
};

export const RemoteCrmCompaniesPage = () => {
  const { locale } = useConsoleLocale();
  const query = consoleHostApi.adminData.useRecords({
    entityName: "companies",
    moduleName: "remote-crm",
  });
  const rows = (query.data?.data ?? []).map(companyRow);
  const zh = locale === "zh-CN";

  return (
    <ConsolePage>
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>{zh ? "公司" : "Companies"}</ConsolePage.Title>
          <ConsolePage.Description>
            {zh
              ? "由 Remote CRM 模块通过宿主 schema-admin 能力提供的公司记录。"
              : "Company records exposed by Remote CRM through the host schema-admin capability."}
          </ConsolePage.Description>
        </ConsolePage.Heading>
      </ConsolePage.Header>
      <ConsolePage.Body>
        <SplitView>
          <SplitView.Main>
            <Section>
              <Section.Header>
                <Section.Title>{zh ? "公司" : "Companies"}</Section.Title>
                <Section.Meta>
                  {rows.length} {zh ? "条记录" : "records"}
                </Section.Meta>
              </Section.Header>
              <CompaniesContent
                error={query.error}
                isError={query.isError}
                isPending={query.isPending}
                rows={rows}
                zh={zh}
              />
            </Section>
          </SplitView.Main>
          <SplitView.Inspector>
            <Section>
              <Section.Header>
                <Section.Title>
                  {zh ? "页面来源" : "Surface provenance"}
                </Section.Title>
              </Section.Header>
              <KeyValueList>
                <KeyValueList.Row
                  label={zh ? "工作区" : "Workspace"}
                  value="CRM"
                />
                <KeyValueList.Row
                  label={zh ? "分组" : "Group"}
                  value={zh ? "客户" : "Customers"}
                />
                <KeyValueList.Row
                  label={zh ? "页面" : "Surface"}
                  value={zh ? "公司" : "Companies"}
                />
                <KeyValueList.Row
                  label={zh ? "模块" : "Module"}
                  value="remote-crm"
                />
              </KeyValueList>
            </Section>
          </SplitView.Inspector>
        </SplitView>
      </ConsolePage.Body>
    </ConsolePage>
  );
};
