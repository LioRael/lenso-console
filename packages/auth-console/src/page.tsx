import {
  Badge,
  Button,
  ConsolePage,
  DataRow,
  FilterControl,
  InlineStatus,
  Inspector,
  KeyValueList,
  PaneHeader,
  SplitView,
  StateView,
  SummaryStrip,
  TableHeader,
  Tabs,
  consoleHostApi,
  useConsoleLocale,
} from "@lenso/console-package-api";
import { ChevronDown } from "lucide-react";
import { useState, type PropsWithChildren, type ReactNode } from "react";

import {
  authDeviceRows,
  authProviderById,
  authProviderRows,
  authSessionRows,
  authUserRows,
  type AuthProviderId,
  type AuthProviderRow,
} from "./model";

const providerKinds = ["All providers", "OAuth Provider", "OIDC Provider"];
const providerOwners = [
  "Any module",
  "auth-github",
  "auth-google",
  "auth-oidc",
];
const providerStates = ["Registered", "All states"];

export function AuthOverviewPage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  return (
    <AuthPage
      description={
        zh
          ? "在一个认证工作区中查看操作员身份、会话、凭据和登录页面。"
          : "Observe operator identity, sessions, credentials, and sign-in surfaces from one Auth workspace."
      }
      title={zh ? "认证" : "Auth"}
    >
      <SummaryStrip>
        <SummaryStrip.Item
          label={zh ? "用户" : "Users"}
          note="auth.users.read"
          value="4"
        />
        <SummaryStrip.Item
          label={zh ? "会话" : "Sessions"}
          note={zh ? "活跃" : "active"}
          value="3"
        />
        <SummaryStrip.Item
          label={zh ? "提供方" : "Providers"}
          note={zh ? "已注册" : "registered"}
          value="3"
        />
      </SummaryStrip>
      <div className="grid gap-px border-b border-(--line-subtle) bg-(--line-subtle) sm:grid-cols-3">
        <AuthOverviewCard
          description={
            zh
              ? "来自认证模块的目录与会话证据。"
              : "Directory and session evidence from the Auth module."
          }
          href="/auth/users"
          title={zh ? "目录" : "Directory"}
        />
        <AuthOverviewCard
          description={
            zh
              ? "已注册的 OAuth 与 OIDC 页面及其模块归属。"
              : "Registered OAuth and OIDC surfaces with module ownership."
          }
          href="/auth/providers"
          title={zh ? "登录" : "Sign-in"}
        />
        <AuthOverviewCard
          description={
            zh
              ? "设备与凭据状态保留在模块负责的边界内。"
              : "Device and credential state stays inside module-owned seams."
          }
          href="/auth/credentials"
          title={zh ? "凭据 / 设备" : "Credentials / Devices"}
        />
      </div>
    </AuthPage>
  );
}

export function AuthUsersPage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const usersQuery = consoleHostApi.adminData.useRecords({
    entityName: "users",
    moduleName: "auth",
  });
  const rows = authUserRows(usersQuery.data?.data ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(
    rows[0]?.id ?? null
  );
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const actions = consoleHostApi.contributions.useSlot(
    "auth.users.detail.actions",
    { user_id: selected?.id ?? "" }
  );
  const invokeAction = consoleHostApi.adminData.useInvokeAction();

  return (
    <AuthPage
      description={
        zh
          ? "认证模块提供的操作员用户记录。"
          : "Operator-facing user records exposed by the Auth module."
      }
      title={zh ? "用户" : "Users"}
    >
      <SplitView className="auth-list-workspace" inspectorWidth={376}>
        <SplitView.Main>
          <PaneHeader
            meta={`${rows.length} ${zh ? "条记录" : "records"}`}
            title={zh ? "目录" : "Directory"}
          />
          <TableHeader
            columns={
              zh
                ? ["用户", "状态", "类型", "创建时间"]
                : ["User", "State", "Type", "Created"]
            }
          />
          {usersQuery.isError ? (
            <StateView
              description={String(usersQuery.error.message)}
              title={zh ? "用户加载失败" : "Users could not be loaded"}
            />
          ) : rows.length === 0 ? (
            <StateView
              description={
                zh
                  ? "认证模块未返回用户记录。"
                  : "The Auth module returned no user records."
              }
              title={zh ? "暂无用户" : "No users"}
            />
          ) : (
            rows.map((row) => (
              <DataRow
                cells={[row.state, row.anonymous, row.createdAt]}
                interactive
                key={row.id}
                onActivate={() => setSelectedId(row.id)}
                primary={row.id}
                secondary={zh ? "认证用户" : "Auth user"}
                selected={row.id === selected?.id}
              />
            ))
          )}
        </SplitView.Main>
        <SplitView.Inspector>
          <Inspector
            className="product-inspector"
            status={
              selected ? (
                <InlineStatus tone="success">
                  {zh ? "活跃记录" : "Active record"}
                </InlineStatus>
              ) : undefined
            }
            subtitle={selected?.id}
            title={
              selected ? (zh ? "用户" : "User") : zh ? "未选择" : "No selection"
            }
          >
            <Inspector.Section title={zh ? "身份" : "Identity"}>
              {selected ? (
                <KeyValueList>
                  <KeyValueList.Row
                    label={zh ? "用户 ID" : "User ID"}
                    value={selected.id}
                  />
                  <KeyValueList.Row
                    label={zh ? "状态" : "State"}
                    value={selected.state}
                  />
                  <KeyValueList.Row
                    label={zh ? "类型" : "Type"}
                    value={selected.anonymous}
                  />
                  <KeyValueList.Row
                    label={zh ? "创建时间" : "Created"}
                    value={selected.createdAt}
                  />
                </KeyValueList>
              ) : zh ? (
                "选择用户行查看身份状态。"
              ) : (
                "Select a user row to inspect identity state."
              )}
            </Inspector.Section>
            {selected && actions.length > 0 ? (
              <Inspector.Section title={zh ? "操作" : "Actions"}>
                <div className="flex flex-wrap gap-2">
                  {actions.map((action) => (
                    <Button
                      key={action.key}
                      onClick={() =>
                        invokeAction.mutate({
                          actionName: action.actionName,
                          input: action.input,
                          moduleName: action.moduleName,
                        })
                      }
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </Inspector.Section>
            ) : null}
          </Inspector>
        </SplitView.Inspector>
      </SplitView>
    </AuthPage>
  );
}

export function AuthSessionsPage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const sessionsQuery = consoleHostApi.adminData.useRecords({
    entityName: "sessions",
    moduleName: "auth",
  });
  const rows = authSessionRows(sessionsQuery.data?.data ?? []);

  return (
    <AuthPage
      description={
        zh
          ? "包含过期时间、设备和网络上下文的当前会话证据。"
          : "Current session evidence with expiry, device, and network context."
      }
      title={zh ? "会话" : "Sessions"}
    >
      <SplitView className="auth-list-workspace" inspectorWidth={376}>
        <SplitView.Main>
          <PaneHeader
            meta={`${rows.length} ${zh ? "个会话" : "sessions"}`}
            title={zh ? "会话清单" : "Session inventory"}
          />
          <TableHeader
            columns={
              zh
                ? ["会话", "用户", "设备", "状态"]
                : ["Session", "User", "Device", "State"]
            }
          />
          {rows.map((row) => (
            <DataRow
              cells={[
                row.userId,
                row.deviceId,
                <InlineStatus key="state" tone="success">
                  {row.state}
                </InlineStatus>,
              ]}
              key={row.id}
              primary={row.id}
              secondary={row.clientIp}
            />
          ))}
        </SplitView.Main>
        <SplitView.Inspector>
          <Inspector
            className="product-inspector"
            subtitle="auth.sessions"
            title={zh ? "会话页面" : "Session surface"}
          >
            <Inspector.Section title={zh ? "归属" : "Ownership"}>
              <KeyValueList>
                <KeyValueList.Row label={zh ? "模块" : "Module"} value="auth" />
                <KeyValueList.Row
                  label={zh ? "实体" : "Entity"}
                  value="sessions"
                />
                <KeyValueList.Row
                  label={zh ? "证据" : "Evidence"}
                  value="schema-admin"
                />
              </KeyValueList>
            </Inspector.Section>
          </Inspector>
        </SplitView.Inspector>
      </SplitView>
    </AuthPage>
  );
}

export function AuthCredentialsPage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const devicesQuery = consoleHostApi.adminData.useRecords({
    entityName: "devices",
    moduleName: "auth-device",
  });
  const rows = authDeviceRows(devicesQuery.data?.data ?? []);

  return (
    <AuthPage
      description={
        zh
          ? "设备与凭据状态始终归属于负责它的模块。"
          : "Device and credential posture stays attributable to the module that owns it."
      }
      title={zh ? "凭据 / 设备" : "Credentials / Devices"}
    >
      <SplitView className="auth-list-workspace" inspectorWidth={376}>
        <SplitView.Main>
          <PaneHeader
            meta={`${rows.length} ${zh ? "个设备" : "devices"}`}
            title={zh ? "设备清单" : "Device inventory"}
          />
          <TableHeader
            columns={
              zh
                ? ["设备", "用户", "最后在线", "信任"]
                : ["Device", "User", "Last seen", "Trust"]
            }
          />
          {rows.map((row) => (
            <DataRow
              cells={[
                row.userId,
                row.lastSeenAt,
                <InlineStatus key="trusted" tone="success">
                  {zh ? "可信" : "Trusted"}
                </InlineStatus>,
              ]}
              key={row.id}
              primary={row.id}
              secondary={row.lastSeenIp}
            />
          ))}
        </SplitView.Main>
        <SplitView.Inspector>
          <Inspector
            className="product-inspector"
            subtitle="auth-device.devices"
            title={zh ? "设备页面" : "Device surface"}
          >
            <Inspector.Section title={zh ? "边界" : "Boundary"}>
              <KeyValueList>
                <KeyValueList.Row
                  label={zh ? "模块" : "Module"}
                  value="auth-device"
                />
                <KeyValueList.Row
                  label={zh ? "实体" : "Entity"}
                  value="devices"
                />
                <KeyValueList.Row
                  label={zh ? "写入" : "Writes"}
                  value="module-owned"
                />
              </KeyValueList>
            </Inspector.Section>
          </Inspector>
        </SplitView.Inspector>
      </SplitView>
    </AuthPage>
  );
}

export function AuthProvidersPage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const modulesQuery = consoleHostApi.modules.useMetadata();
  const providers = authProviderRows(modulesQuery.data?.modules ?? []);
  const [providerFilter, setProviderFilter] = useState(providerKinds[0]!);
  const [ownerFilter, setOwnerFilter] = useState(providerOwners[0]!);
  const [stateFilter, setStateFilter] = useState(providerStates[0]!);
  const [selectedId, setSelectedId] = useState<AuthProviderId>("github");
  const selected = authProviderById(providers, selectedId);
  const visibleProviders = providers.filter((provider) => {
    const kindMatch =
      providerFilter === "All providers" || provider.surface === providerFilter;
    const ownerMatch =
      ownerFilter === "Any module" || provider.owner === ownerFilter;
    const stateMatch =
      stateFilter === "All states" ||
      provider.state === stateFilter.toLowerCase();
    return kindMatch && ownerMatch && stateMatch;
  });

  return (
    <AuthPage
      className="auth-providers-page"
      description={
        zh
          ? "已注册的登录页面及其模块负责的配置。"
          : "Registered sign-in surfaces and their module-owned configuration."
      }
      meta={
        <span className="text-[11px] text-(--fg-tertiary)">
          {zh ? "页面分组 · 登录" : "Surface group · Sign-in"}
        </span>
      }
      title={zh ? "提供方" : "Providers"}
    >
      <div className="auth-providers-page__filters">
        <AuthFilter
          label={providerFilterLabel(providerFilter, zh)}
          onClick={() =>
            setProviderFilter(cycleFilter(providerKinds, providerFilter))
          }
        />
        <AuthFilter
          label={providerFilterLabel(ownerFilter, zh)}
          onClick={() =>
            setOwnerFilter(cycleFilter(providerOwners, ownerFilter))
          }
        />
        <AuthFilter
          label={providerFilterLabel(stateFilter, zh)}
          onClick={() =>
            setStateFilter(cycleFilter(providerStates, stateFilter))
          }
        />
      </div>
      <SplitView
        className="auth-providers-page__workspace"
        data-testid="auth-providers-workspace"
        inset="none"
        inspectorWidth={376}
      >
        <SplitView.Main className="auth-providers-page__main">
          <div
            aria-label={zh ? "提供方页面" : "Provider surfaces"}
            className="auth-providers-page__table"
          >
            <PaneHeader
              meta={`${visibleProviders.length} ${zh ? "已注册" : "registered"}`}
              title={zh ? "提供方页面" : "Provider surfaces"}
            />
            <TableHeader
              columns={
                zh
                  ? ["提供方", "页面", "路由", "状态"]
                  : ["Provider", "Surface", "Routes", "State"]
              }
              variant="provider"
            />
            <div className="h-px bg-(--line-subtle)" />
            {visibleProviders.length === 0 ? (
              <StateView
                description={
                  zh
                    ? "没有提供方符合当前筛选条件。"
                    : "No provider matches the current filters."
                }
                title={zh ? "暂无提供方" : "No providers"}
              />
            ) : (
              visibleProviders.map((provider) => (
                <div key={provider.id}>
                  <DataRow
                    aria-label={
                      zh
                        ? `查看 ${provider.label}`
                        : `Inspect ${provider.label}`
                    }
                    cells={[
                      provider.route,
                      provider.operations,
                      <InlineStatus
                        key="status"
                        tone={
                          provider.state === "registered"
                            ? "success"
                            : "warning"
                        }
                      >
                        {provider.state === "registered"
                          ? zh
                            ? "已注册"
                            : "Registered"
                          : zh
                            ? "降级"
                            : "Degraded"}
                      </InlineStatus>,
                    ]}
                    interactive
                    onActivate={() => setSelectedId(provider.id)}
                    primary={provider.label}
                    secondary={provider.moduleName}
                    selected={provider.id === selected.id}
                    variant="provider"
                  />
                  <div className="h-px bg-(--line-subtle)" />
                </div>
              ))
            )}
          </div>
        </SplitView.Main>
        <SplitView.Inspector className="auth-providers-page__inspector">
          <AuthProviderInspector provider={selected} />
        </SplitView.Inspector>
      </SplitView>
    </AuthPage>
  );
}

export function AuthGitHubPage() {
  return <AuthProviderSurfacePage providerId="github" />;
}

export function AuthGooglePage() {
  return <AuthProviderSurfacePage providerId="google" />;
}

export function AuthOidcPage() {
  return <AuthProviderSurfacePage providerId="oidc" />;
}

function AuthProviderSurfacePage({
  providerId,
}: {
  providerId: AuthProviderId;
}) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const modulesQuery = consoleHostApi.modules.useMetadata();
  const provider = authProviderById(
    authProviderRows(modulesQuery.data?.modules ?? []),
    providerId
  );

  return (
    <AuthPage
      description={
        zh
          ? "提供方负责的路由、配置边界和运行时证据。"
          : "Provider-owned routes, configuration boundaries, and runtime evidence."
      }
      meta={
        <Badge tone="success">{zh ? "已注册页面" : "Registered surface"}</Badge>
      }
      title={provider.label}
    >
      <SplitView className="auth-provider-detail" inspectorWidth={376}>
        <SplitView.Main>
          <PaneHeader
            meta={provider.moduleName}
            title={zh ? "提供方页面" : "Provider surface"}
          />
          <div className="grid gap-px border-b border-(--line-subtle) bg-(--line-subtle) sm:grid-cols-2">
            <DetailCard
              label={zh ? "页面" : "Surface"}
              value={provider.surface}
            />
            <DetailCard label={zh ? "路径" : "Path"} value={provider.route} />
            <DetailCard
              label={zh ? "操作" : "Operations"}
              value={provider.operations}
            />
            <DetailCard label={zh ? "归属" : "Owner"} value={provider.owner} />
          </div>
        </SplitView.Main>
        <SplitView.Inspector className="auth-provider-detail__inspector">
          <AuthProviderInspector provider={provider} />
        </SplitView.Inspector>
      </SplitView>
    </AuthPage>
  );
}

function AuthProviderInspector({ provider }: { provider: AuthProviderRow }) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const [tab, setTab] = useState<"overview" | "configuration">("overview");

  return (
    <Inspector
      className="product-inspector auth-providers-inspector"
      status={
        <InlineStatus
          tone={provider.state === "registered" ? "success" : "warning"}
        >
          {provider.state === "registered"
            ? zh
              ? "已注册页面"
              : "Registered surface"
            : zh
              ? "降级页面"
              : "Degraded surface"}
        </InlineStatus>
      }
      subtitle={provider.moduleName}
      title={provider.label}
    >
      <Tabs
        className="auth-providers-inspector__tabs"
        density="inspector"
        inset="none"
      >
        <Tabs.List inset="none">
          <Tabs.Tab
            onClick={() => setTab("overview")}
            selected={tab === "overview"}
          >
            {zh ? "概览" : "Overview"}
          </Tabs.Tab>
          <Tabs.Tab
            onClick={() => setTab("configuration")}
            selected={tab === "configuration"}
          >
            {zh ? "配置" : "Configuration"}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <div className="auth-providers-inspector__rule" />
      {tab === "overview" ? (
        <>
          <Inspector.Section title={zh ? "页面" : "Surface"}>
            <div className="auth-providers-inspector__copy">
              <p>{zh ? "分组：登录" : "Group: Sign-in"}</p>
              <p>
                {zh ? "路径：" : "Path: "}
                {provider.route}
              </p>
              <p>{zh ? "工作区：认证" : "Workspace: Auth"}</p>
            </div>
          </Inspector.Section>
          <Inspector.Section title={zh ? "操作" : "Operations"}>
            <div className="auth-providers-inspector__copy">
              <p>{zh ? "开始登录" : "Start sign-in"}</p>
              <p>{zh ? "完成回调" : "Complete callback"}</p>
              <p>{zh ? "打开关联故事" : "Open related stories"}</p>
            </div>
          </Inspector.Section>
          <Inspector.Section title={zh ? "归属" : "Ownership"}>
            <div className="auth-providers-inspector__copy">
              <p>
                {zh ? "归属：" : "Owner: "}
                {provider.owner}
              </p>
              <p>{zh ? "效果：提供方模块" : "Effects: provider module"}</p>
              <p>{zh ? "证据：运行时" : "Evidence: runtime"}</p>
            </div>
          </Inspector.Section>
        </>
      ) : (
        <Inspector.Section title={zh ? "配置" : "Configuration"}>
          <div className="auth-providers-inspector__copy">
            {provider.configuration.map((field) => (
              <p key={field}>{field}</p>
            ))}
          </div>
        </Inspector.Section>
      )}
      <Inspector.Actions>
        <Button variant="primary">
          {zh ? "打开" : "Open"} {provider.label}
        </Button>
      </Inspector.Actions>
    </Inspector>
  );
}

function AuthPage({
  children,
  className,
  description,
  meta,
  title,
}: PropsWithChildren<{
  className?: string;
  description: string;
  meta?: ReactNode;
  title: string;
}>) {
  return (
    <ConsolePage className={className ? `auth-page ${className}` : "auth-page"}>
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>{title}</ConsolePage.Title>
          <ConsolePage.Description>{description}</ConsolePage.Description>
        </ConsolePage.Heading>
        {meta ? <ConsolePage.Actions>{meta}</ConsolePage.Actions> : null}
      </ConsolePage.Header>
      <ConsolePage.Body className="auth-page__body">
        {children}
      </ConsolePage.Body>
    </ConsolePage>
  );
}

function AuthOverviewCard({
  description,
  href,
  title,
}: {
  description: string;
  href: string;
  title: string;
}) {
  return (
    <a className="auth-overview-card" href={href}>
      <strong>{title}</strong>
      <span>{description}</span>
      <span className="font-mono text-[10px] text-(--fg-tertiary)">{href}</span>
    </a>
  );
}

function AuthFilter({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <FilterControl
      aria-label={`Filter providers by ${label}`}
      icon={<ChevronDown size={12} strokeWidth={1.5} />}
      onClick={onClick}
    >
      {label}
    </FilterControl>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-(--bg-canvas) p-4">
      <span className="block text-[10px] text-(--fg-tertiary)">{label}</span>
      <strong className="mt-1 block text-[12px] font-medium text-(--fg-primary)">
        {value}
      </strong>
    </div>
  );
}

function cycleFilter(values: readonly string[], current: string) {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length] ?? values[0]!;
}

function providerFilterLabel(value: string, zh: boolean) {
  if (!zh) {
    return value;
  }
  return (
    {
      "All providers": "所有提供方",
      "All states": "所有状态",
      "Any module": "任意模块",
      "OAuth Provider": "OAuth 提供方",
      "OIDC Provider": "OIDC 提供方",
      Registered: "已注册",
      "auth-github": "auth-github",
      "auth-google": "auth-google",
      "auth-oidc": "auth-oidc",
    }[value] ?? value
  );
}
