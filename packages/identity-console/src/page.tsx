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
  useConsoleLocale,
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
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
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
          <ConsolePage.Title>{zh ? "身份" : "Identity"}</ConsolePage.Title>
          <ConsolePage.Description>
            {zh
              ? "由已连接的 Identity 模块通过共享 schema-admin 宿主能力提供的用户。"
              : "Users exposed by the linked Identity module through the shared schema-admin host capability."}
          </ConsolePage.Description>
        </ConsolePage.Heading>
        <ConsolePage.Actions>
          <Badge>{zh ? "已连接模块" : "linked module"}</Badge>
          <Badge>schema-admin</Badge>
        </ConsolePage.Actions>
      </ConsolePage.Header>

      <ConsolePage.Body className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <SummaryStrip>
          <SummaryStrip.Item
            label={zh ? "记录" : "Records"}
            value={summary.total}
          />
          <SummaryStrip.Item
            label={zh ? "最新记录" : "Latest record"}
            value={summary.latestCreatedAt}
          />
          <SummaryStrip.Item
            label={zh ? "页面" : "Surface"}
            value="schema-admin"
          />
        </SummaryStrip>
        <SplitView>
          <SplitView.Main>
            <Section>
              <Section.Header>
                <Section.Title>{zh ? "用户" : "Users"}</Section.Title>
                <Section.Meta>
                  {summary.total} {zh ? "条记录" : "records"}
                </Section.Meta>
              </Section.Header>
              {usersQuery.isError ? (
                <StateView
                  description={String(usersQuery.error.message)}
                  title={zh ? "用户加载失败" : "Users could not be loaded"}
                />
              ) : usersQuery.isPending ? (
                <StateView
                  description={
                    zh
                      ? "正在读取 schema-admin 页面。"
                      : "Reading the schema-admin surface."
                  }
                  title={zh ? "正在加载用户" : "Loading users"}
                />
              ) : userRows.length === 0 ? (
                <StateView
                  description={
                    zh
                      ? "Identity 模块未返回记录。"
                      : "The Identity module returned no records."
                  }
                  title={zh ? "暂无用户" : "No users"}
                />
              ) : (
                <DataTable className="min-w-[720px]">
                  <DataTable.Head>
                    <DataTable.Row>
                      <DataTable.Header>{zh ? "ID" : "ID"}</DataTable.Header>
                      <DataTable.Header>
                        {zh ? "邮箱" : "Email"}
                      </DataTable.Header>
                      <DataTable.Header>
                        {zh ? "显示名称" : "Display name"}
                      </DataTable.Header>
                      <DataTable.Header>
                        {zh ? "创建时间" : "Created"}
                      </DataTable.Header>
                      <DataTable.Header>
                        {zh ? "更新时间" : "Updated"}
                      </DataTable.Header>
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
                <Section.Title>
                  {zh ? "用户页面" : "User surface"}
                </Section.Title>
                <Section.Meta>
                  {userFields.length} {zh ? "个字段" : "fields"}
                </Section.Meta>
              </Section.Header>
              <DataTable>
                <DataTable.Head>
                  <DataTable.Row>
                    <DataTable.Header>{zh ? "字段" : "Field"}</DataTable.Header>
                    <DataTable.Header>{zh ? "类型" : "Type"}</DataTable.Header>
                  </DataTable.Row>
                </DataTable.Head>
                <DataTable.Body>
                  {userFields.map(([field, type, constraint]) => (
                    <DataTable.Row key={field}>
                      <DataTable.Cell className="font-mono text-xs">
                        {field}
                      </DataTable.Cell>
                      <DataTable.Cell>
                        {type} · {identityConstraint(constraint, zh)}
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))}
                </DataTable.Body>
              </DataTable>
            </Section>
            <Section>
              <Section.Header>
                <Section.Title>
                  {zh ? "包契约" : "Package contract"}
                </Section.Title>
              </Section.Header>
              <KeyValueList>
                {surfaceRows.map(([label, value]) => (
                  <KeyValueList.Row
                    key={label}
                    label={identityLabel(label, zh)}
                    value={value}
                  />
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
                {workflowRows.map(([label, value]) => (
                  <KeyValueList.Row
                    key={label}
                    label={identityLabel(label, zh)}
                    value={identityWorkflowValue(value, zh)}
                  />
                ))}
              </KeyValueList>
            </Section>
          </SplitView.Inspector>
        </SplitView>
      </ConsolePage.Body>
    </ConsolePage>
  );
}

function identityLabel(label: string, zh: boolean) {
  if (!zh) {
    return label;
  }
  return (
    {
      Capability: "能力",
      Export: "导出",
      Module: "模块",
      Package: "包",
      Route: "路由",
      Schema: "架构",
      Stories: "故事",
      Runtime: "运行时",
    }[label] ?? label
  );
}

function identityConstraint(constraint: string, zh: boolean) {
  if (!zh) {
    return constraint;
  }
  return constraint === "required" ? "必填" : "可空";
}

function identityWorkflowValue(value: string, zh: boolean) {
  if (!zh) {
    return value;
  }
  return value
    .replace(
      "Identity exposes Users through schema-admin",
      "Identity 通过 schema-admin 暴露用户"
    )
    .replace(
      "identity.cleanup_expired_sessions.v1 is declared",
      "已声明 identity.cleanup_expired_sessions.v1"
    )
    .replace(
      "registration and current-user routes carry story labels",
      "注册和当前用户路由带有故事标签"
    );
}
