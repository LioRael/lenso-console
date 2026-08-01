import {
  Badge,
  ConsolePage,
  DataTable,
  KeyValueList,
  Section,
  SplitView,
  StateView,
  consoleHostApi,
  useConsoleLocale,
} from "@lenso/console-package-api";

import { remoteCrmContactRows, remoteCrmContactsSummary } from "./model";

const surfaceRows = (zh: boolean) =>
  [
    [zh ? "工作区" : "Workspace", "CRM"],
    [zh ? "分组" : "Group", zh ? "客户" : "Customers"],
    [zh ? "页面" : "Surface", zh ? "联系人" : "Contacts"],
    [zh ? "模块" : "Module", "remote-crm"],
    [zh ? "包" : "Package", "@lenso/remote-crm-console"],
    [zh ? "导出" : "Export", "remoteCrmConsoleModule"],
    [zh ? "路由" : "Route", "/data/remote-crm"],
    [zh ? "能力" : "Capability", "remote_crm.contacts.read"],
  ] as const;

const workflowRows = (zh: boolean) =>
  [
    [
      "Manifest",
      zh
        ? "远程模块声明此 ConsoleSurface"
        : "remote module declares this ConsoleSurface",
    ],
    [
      zh ? "数据" : "Data",
      zh
        ? "联系人通过宿主 schema-admin 读取"
        : "contacts are read through host schema-admin",
    ],
    [
      zh ? "运行时" : "Runtime",
      zh
        ? "remote_crm.sync_contact.v1 通过宿主 worker 队列运行"
        : "remote_crm.sync_contact.v1 runs through host worker queues",
    ],
  ] as const;

const RemoteCrmContactsContent = ({
  error,
  isError,
  isPending,
  rows,
  zh,
}: {
  error: unknown;
  isError: boolean;
  isPending: boolean;
  rows: ReturnType<typeof remoteCrmContactRows>;
  zh: boolean;
}) => {
  if (isError) {
    return (
      <StateView
        description={String((error as Error | undefined)?.message)}
        title={zh ? "联系人加载失败" : "Contacts could not be loaded"}
      />
    );
  }
  if (isPending) {
    return (
      <StateView
        description={
          zh
            ? "正在读取 schema-admin 页面。"
            : "Reading the schema-admin surface."
        }
        title={zh ? "正在加载联系人" : "Loading contacts"}
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
        title={zh ? "暂无联系人" : "No contacts"}
      />
    );
  }

  return (
    <DataTable className="min-w-[680px]">
      <DataTable.Head>
        <DataTable.Row>
          <DataTable.Header>{zh ? "联系人" : "Contact"}</DataTable.Header>
          <DataTable.Header>{zh ? "邮箱" : "Email"}</DataTable.Header>
          <DataTable.Header>{zh ? "公司" : "Company"}</DataTable.Header>
          <DataTable.Header>{zh ? "状态" : "Status"}</DataTable.Header>
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
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
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
          <ConsolePage.Title>{zh ? "联系人" : "Contacts"}</ConsolePage.Title>
          <ConsolePage.Description>
            {zh
              ? "由 @lenso/remote-crm-console 提供的客户身份与账户关系。"
              : "Customer identities and account relationships provided by @lenso/remote-crm-console."}
          </ConsolePage.Description>
        </ConsolePage.Heading>
      </ConsolePage.Header>

      <ConsolePage.Body className="min-h-0 overflow-hidden">
        <SplitView>
          <SplitView.Main>
            <Section>
              <Section.Header>
                <Section.Title>{zh ? "联系人" : "Contacts"}</Section.Title>
                <Section.Meta>
                  {summary.total} {zh ? "条记录" : "records"}
                </Section.Meta>
              </Section.Header>
              <RemoteCrmContactsContent
                error={contactsQuery.error}
                isError={contactsQuery.isError}
                isPending={contactsQuery.isPending}
                rows={contactRows}
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
                {surfaceRows(zh).map(([label, value]) => (
                  <KeyValueList.Row key={label} label={label} value={value} />
                ))}
              </KeyValueList>
            </Section>
            <Section>
              <Section.Header>
                <Section.Title>
                  {zh ? "执行路径" : "Execution path"}
                </Section.Title>
              </Section.Header>
              <KeyValueList>
                {workflowRows(zh).map(([label, value]) => (
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
