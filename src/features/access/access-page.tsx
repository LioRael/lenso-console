import {
  Button,
  DataGrid,
  DataRow,
  PaneHeader,
  TableHeader,
  useConsoleLocale,
} from "@lenso/console-ui";
import { useState } from "react";

import {
  type ConsoleAccessGrant,
  type ConsoleAccessOrganization,
  type ConsoleAccessUser,
  useConsoleAccessGrants,
  useConsoleAccessOrganizations,
  useConsoleAccessUsers,
} from "../../app/console-access-api";
import { ProductPage, ProductTabs } from "../console-design/components";

type AccessTab = "users" | "organizations" | "grants";

export function ConsoleAccessPage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const [tab, setTab] = useState<AccessTab>("users");
  const users = useConsoleAccessUsers();
  const organizations = useConsoleAccessOrganizations();
  const grants = useConsoleAccessGrants();

  return (
    <ProductPage
      description={
        zh
          ? "管理 Console 身份、组织成员关系，以及独立于 Managed Service 的访问授权。"
          : "Manage Console identities, organization memberships, and access grants independently from Managed Services."
      }
      meta={
        <Button
          onClick={() => {
            void Promise.all([
              users.refetch(),
              organizations.refetch(),
              grants.refetch(),
            ]);
          }}
          variant="secondary"
        >
          {zh ? "刷新" : "Refresh"}
        </Button>
      }
      pageKind="console-access-page"
      title={zh ? "Console Access" : "Console Access"}
    >
      <ProductTabs
        active={tab}
        items={
          zh
            ? ["users", "organizations", "grants"]
            : ["users", "organizations", "grants"]
        }
        onChange={(value) => setTab(value as AccessTab)}
        pageSlot="console-access-tabs"
      />
      {tab === "users" ? (
        <UsersPanel
          emptyLabel={zh ? "暂无 Console 用户" : "No Console users"}
          loading={users.isPending}
          rows={users.data?.data ?? []}
          title={zh ? "用户" : "Users"}
        />
      ) : null}
      {tab === "organizations" ? (
        <OrganizationsPanel
          emptyLabel={zh ? "暂无 Console 组织" : "No Console organizations"}
          loading={organizations.isPending}
          rows={organizations.data?.data ?? []}
          title={zh ? "组织" : "Organizations"}
        />
      ) : null}
      {tab === "grants" ? (
        <GrantsPanel
          emptyLabel={
            zh
              ? "暂无 Managed Service 访问授权"
              : "No Managed Service access grants"
          }
          loading={grants.isPending}
          rows={grants.data ?? []}
          title={zh ? "访问授权" : "Access grants"}
        />
      ) : null}
    </ProductPage>
  );
}

function UsersPanel({
  emptyLabel,
  loading,
  rows,
  title,
}: {
  emptyLabel: string;
  loading: boolean;
  rows: ConsoleAccessUser[];
  title: string;
}) {
  return (
    <DataGrid>
      <PaneHeader meta={`${rows.length}`} title={title} />
      <TableHeader columns={["Identity", "Type", "Login state"]} />
      {loading ? (
        <DataRow primary="Loading Console users…" />
      ) : rows.length === 0 ? (
        <DataRow primary={emptyLabel} />
      ) : (
        rows.map((user) => (
          <DataRow
            cells={[
              user.is_anonymous ? "Anonymous" : "Password",
              user.disabled_at ? "Disabled" : "Active",
            ]}
            key={user.id}
            primary={user.id}
            secondary={user.created_at}
          />
        ))
      )}
    </DataGrid>
  );
}

function OrganizationsPanel({
  emptyLabel,
  loading,
  rows,
  title,
}: {
  emptyLabel: string;
  loading: boolean;
  rows: ConsoleAccessOrganization[];
  title: string;
}) {
  return (
    <DataGrid>
      <PaneHeader meta={`${rows.length}`} title={title} />
      <TableHeader columns={["Organization", "Slug", "State"]} />
      {loading ? (
        <DataRow primary="Loading Console organizations…" />
      ) : rows.length === 0 ? (
        <DataRow primary={emptyLabel} />
      ) : (
        rows.map((organization) => (
          <DataRow
            cells={[
              organization.slug,
              organization.archived_at ? "Archived" : "Active",
            ]}
            key={organization.id}
            primary={organization.name}
            secondary={organization.id}
          />
        ))
      )}
    </DataGrid>
  );
}

function GrantsPanel({
  emptyLabel,
  loading,
  rows,
  title,
}: {
  emptyLabel: string;
  loading: boolean;
  rows: ConsoleAccessGrant[];
  title: string;
}) {
  return (
    <DataGrid>
      <PaneHeader meta={`${rows.length}`} title={title} />
      <TableHeader columns={["Managed Service", "Subject", "Capabilities"]} />
      {loading ? (
        <DataRow primary="Loading Managed Service grants…" />
      ) : rows.length === 0 ? (
        <DataRow primary={emptyLabel} />
      ) : (
        rows.map((grant) => (
          <DataRow
            cells={[
              `${grant.subject_type}:${grant.subject_id}`,
              grant.capabilities.join(", "),
            ]}
            key={grant.id}
            primary={grant.service_id}
            secondary={grant.revoked_at ? "Revoked" : grant.id}
          />
        ))
      )}
    </DataGrid>
  );
}
