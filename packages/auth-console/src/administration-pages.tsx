import {
  ConsoleIconButton,
  ConsoleLayout,
  ConsolePageScope,
} from "@lenso/console-react";
// Records invokes its cell formatters, never mounts them as React component types.
/* eslint-disable react/no-unstable-nested-components */
import {
  useWorkspace,
  useWorkspaceRead,
  useWorkspaceReadClient,
} from "@lenso/console-sdk/react";
import { ThemeScope } from "@lenso/ui";
import { AlertDialog } from "@lenso/ui/alert-dialog";
import { Button } from "@lenso/ui/button";
import { Checkbox } from "@lenso/ui/checkbox";
import { Input } from "@lenso/ui/input";
import { SearchField } from "@lenso/ui/search-field";
import { Select } from "@lenso/ui/select";
import { Table } from "@lenso/ui/table";
import * as stylex from "@stylexjs/stylex";
import { Plus, RotateCw } from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  AdministrationAction,
  AdministrationClient,
  AdministrationInfo,
  AdministrationInputs,
  ConsoleRole,
  CredentialDelivery,
  DirectoryUser,
} from "./administration-contracts";
import { readOnlyAdministrationActions } from "./administration-contracts";
import { administrationStyles as s } from "./administration-styles";

export interface AdministrationPageProps {
  client: AdministrationClient;
}
export interface IdentityPageProps extends AdministrationPageProps {
  subjectId?: string;
  identityHref?: (subjectId: string) => string;
  returnHref?: string;
  onNavigate?: (href: string) => void;
}

const readKeys = {
  info: "administration.info",
  usersList: "administration.usersList",
  usersRead: "administration.usersRead",
  sessionsList: "administration.sessionsList",
  accessRead: "administration.accessRead",
  permissionsRead: "administration.permissionsRead",
  tokensList: "administration.tokensList",
  auditList: "administration.auditList",
};
const tokenReadScopes = readOnlyAdministrationActions;
const defaultTokenScopes: readonly AdministrationAction[] = [
  "users.list",
  "users.read",
];

function localDateTimeAfter(days: number) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function AdministrationTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: readonly { id: string; label: string; segments: readonly string[] }[];
}) {
  const workspace = useWorkspace();
  const activeId =
    tabs.find((tab) => tab.id === workspace.location.segments[0])?.id ??
    tabs[0]!.id;
  return (
    <ConsolePageScope
      scopeKey={workspace.activation?.key ?? workspace.mount.id}
      value={{
        context: {
          kind: "tabs",
          label,
          activeId,
          tabs: tabs.map(({ id, label: tabLabel, segments }) => ({
            id,
            label: tabLabel,
            href: workspace.navigation.href(segments),
          })),
        },
      }}
    />
  );
}
function useRead<M extends keyof typeof readKeys>(
  client: AdministrationClient,
  method: M,
  input: AdministrationInputs[M]
) {
  return useWorkspaceRead({
    key: readKeys[method],
    params: input,
    read: ({ params, signal }) => client.invoke(method, params, { signal }),
  });
}
function errorText(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (/forbidden|unauthorized|permission/i.test(code)) {
    return "You do not have permission to view or change this data.";
  }
  if (
    code === "OUTCOME_UNKNOWN" &&
    error &&
    typeof error === "object" &&
    "intentId" in error &&
    typeof error.intentId === "string" &&
    /^[a-f0-9-]{36}$/i.test(error.intentId)
  ) {
    return `The outcome is not confirmed. Inspect audit intent ${error.intentId} before retrying.`;
  }
  return "The request could not be completed. Reload to inspect the current state before trying again.";
}
function ReadState({
  read,
  children,
}: {
  read: {
    blocking: boolean;
    refreshing: boolean;
    error: Error | null;
    data: unknown;
  };
  children: ReactNode;
}) {
  if (read.blocking) {
    return <output>Loading…</output>;
  }
  if (read.error) {
    return (
      <p role="alert" {...stylex.props(s.error)}>
        {errorText(read.error)}
      </p>
    );
  }
  if (read.data === undefined) {
    return <output>No data available.</output>;
  }
  return (
    <>
      {read.refreshing && <output>Refreshing…</output>}
      {children}
    </>
  );
}
function Allowed({
  info,
  action,
  children,
}: {
  info: AdministrationInfo;
  action: AdministrationAction;
  children: ReactNode;
}) {
  return info.allowed.includes(action) ? (
    children
  ) : (
    <output>You do not have permission for {action}.</output>
  );
}
function Frame({
  client,
  label,
  children,
}: AdministrationPageProps & {
  label: string;
  children: (info: AdministrationInfo) => ReactNode;
}) {
  const read = useRead(client, "info", {});
  return (
    <section aria-label={label} {...stylex.props(s.page)}>
      {read.error && (
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await read.refetch();
            } catch {
              // ReadState displays the error and remains available to retry.
            }
          }}
        >
          Reload permissions
        </Button>
      )}
      <ReadState read={read}>
        {read.data && (
          <Fragment
            key={`${read.data.consoleId}:${read.data.tenantId}:${read.data.realmId}:${read.data.allowed.join(",")}:${JSON.stringify(read.data.supported)}`}
          >
            {children(read.data)}
          </Fragment>
        )}
      </ReadState>
    </section>
  );
}
function Facts({
  entries,
}: {
  entries: readonly (readonly [string, ReactNode])[];
}) {
  return (
    <dl {...stylex.props(s.metadata)}>
      {entries.map(([label, value]) => (
        <Fragment key={label}>
          <dt {...stylex.props(s.muted)}>{label}</dt>
          <dd {...stylex.props(s.value)}>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
function date(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Not observed"
    : new Date(value).toLocaleString();
}
function Records<T>({
  label,
  items,
  columns,
  rowKey,
}: {
  label: string;
  items: readonly T[];
  rowKey: (item: T) => string;
  columns: readonly {
    id: string;
    label: string;
    render: (item: T) => ReactNode;
  }[];
}) {
  if (!items.length) {
    return <p>No {label.toLowerCase()} found.</p>;
  }
  return (
    <Table.Root variant="secondary">
      <Table.ScrollContainer>
        <Table.Content aria-label={label} xstyle={s.table}>
          <Table.Header>
            {columns.map((column) => (
              <Table.Column
                key={column.id}
                columnKey={column.id}
                minWidth={120}
              >
                {column.label}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body>
            {items.map((item) => (
              <Table.Row
                key={rowKey(item)}
                itemKey={rowKey(item)}
                textValue={rowKey(item)}
              >
                {columns.map((column) => (
                  <Table.Cell
                    key={column.id}
                    columnKey={column.id}
                    xstyle={s.cell}
                  >
                    <div {...stylex.props(s.cellText)}>
                      {column.render(item)}
                    </div>
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table.Root>
  );
}
function Search({
  value,
  change,
  label,
}: {
  value: string;
  change: (value: string) => void;
  label: string;
}) {
  return (
    <SearchField.Root variant="secondary">
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input
          aria-label={label}
          placeholder={label}
          value={value}
          onValueChange={change}
          xstyle={s.control}
        />
        <SearchField.ClearButton
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => change("")}
          disabled={!value}
        />
      </SearchField.Group>
    </SearchField.Root>
  );
}
function Next({
  cursor,
  next,
}: {
  cursor: string | null | undefined;
  next: (cursor: string) => void;
}) {
  return cursor ? (
    <Button variant="secondary" onClick={() => next(cursor)} xstyle={s.control}>
      Next page
    </Button>
  ) : null;
}
function Choice({
  label,
  value,
  change,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  disabled?: boolean;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div {...stylex.props(s.field)}>
      <Select.Root
        value={value}
        onValueChange={(next) => change(next ?? "")}
        disabled={disabled}
        items={options}
      >
        <Select.Label>{label}</Select.Label>
        <Select.Trigger fullWidth xstyle={s.control}>
          <Select.Value placeholder="Choose…" />
          <Select.Indicator />
        </Select.Trigger>
        <ThemeScope>
          <Select.Portal>
            <Select.Positioner sideOffset={8}>
              <Select.Popup>
                <Select.List>
                  {options.map((option) => (
                    <Select.Item key={option.value} value={option.value}>
                      <Select.ItemText>{option.label}</Select.ItemText>
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </ThemeScope>
      </Select.Root>
    </div>
  );
}

/** A failed write locks out repetition until an explicit reload. */
function useWrites(
  verifyReload?: () => Promise<void>,
  afterReload?: () => void
) {
  const cache = useWorkspaceReadClient();
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    detail: string;
    run: () => Promise<unknown>;
  } | null>(null);
  const lock = useRef(false);
  const lifetime = useRef({ value: 0 });
  const opener = useRef<HTMLElement | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const feedbackNode = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const generation = lifetime.current;
    generation.value += 1;
    return () => {
      generation.value += 1;
    };
  }, []);
  async function reload() {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setPending(true);
    const generation = lifetime.current.value;
    try {
      await Promise.all(
        Object.values(readKeys).map((key) => cache.invalidate({ key }))
      );
      await verifyReload?.();
      if (lifetime.current.value === generation) {
        afterReload?.();
        setBlocked(false);
        setFeedback(
          "Data reloaded. Review the current state before making changes."
        );
      }
    } catch {
      if (lifetime.current.value === generation) {
        setFeedback(
          "Reload failed. Inspect the current state before making changes."
        );
      }
    } finally {
      if (lifetime.current.value === generation) {
        lock.current = false;
        setPending(false);
      }
    }
  }
  async function execute() {
    if (lock.current || blocked || !confirmation) {
      return;
    }
    lock.current = true;
    setPending(true);
    const generation = lifetime.current.value;
    const target = confirmation;
    try {
      await target.run();
      if (lifetime.current.value !== generation) {
        return;
      }
      setFeedback("Change completed.");
      await Promise.all(
        Object.values(readKeys).map((key) => cache.invalidate({ key }))
      );
    } catch (error) {
      if (lifetime.current.value === generation) {
        setBlocked(true);
        setFeedback(errorText(error));
        try {
          await Promise.all(
            Object.values(readKeys).map((key) => cache.invalidate({ key }))
          );
        } catch {
          // Keep the original write uncertainty; invalidation cannot confirm its outcome.
        }
      }
    } finally {
      if (lifetime.current.value === generation) {
        setConfirmation(null);
        lock.current = false;
        setPending(false);
      }
    }
  }
  return {
    pending,
    disabled: pending || blocked,
    confirm(title: string, detail: string, run: () => Promise<unknown>) {
      if (!lock.current && !blocked) {
        opener.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setConfirmation({ title, detail, run });
      }
    },
    controls: (
      <>
        <ConsoleLayout.Corner area="topRight">
          <ConsoleIconButton
            label="Reload administration data"
            variant="secondary"
            disabled={pending}
            onClick={() => void reload()}
          >
            <RotateCw aria-hidden="true" />
          </ConsoleIconButton>
        </ConsoleLayout.Corner>
        {feedback && (
          <p
            ref={feedbackNode}
            tabIndex={-1}
            role={blocked ? "alert" : "status"}
          >
            {feedback}
          </p>
        )}
        {blocked && (
          <p>
            Automatic retries are disabled. Reload and inspect the affected
            record and audit events.
          </p>
        )}
        <AlertDialog.Root
          open={confirmation !== null}
          onOpenChange={(open, details) => {
            if (lock.current) {
              details.cancel();
            } else if (!open) {
              setConfirmation(null);
            }
          }}
        >
          <AlertDialog.Portal>
            <AlertDialog.Backdrop />
            <AlertDialog.Viewport>
              <AlertDialog.Popup
                aria-busy={pending}
                initialFocus={cancel}
                finalFocus={() =>
                  feedbackNode.current ?? opener.current ?? false
                }
              >
                <AlertDialog.Header>
                  <AlertDialog.Title>{confirmation?.title}</AlertDialog.Title>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <AlertDialog.Description>
                    {confirmation?.detail}
                  </AlertDialog.Description>
                  {pending && <output>Applying change…</output>}
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button
                    ref={cancel}
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setConfirmation(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    disabled={pending}
                    onClick={() => void execute()}
                  >
                    Confirm
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Popup>
            </AlertDialog.Viewport>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </>
    ),
  };
}
type Writes = ReturnType<typeof useWrites>;

export function IdentityPage(props: IdentityPageProps) {
  return (
    <Frame client={props.client} label="Identity">
      {(info) =>
        props.subjectId ? (
          <Allowed info={info} action="users.read">
            <IdentityDetail
              key={props.subjectId}
              {...props}
              subjectId={props.subjectId}
              info={info}
            />
          </Allowed>
        ) : (
          <Allowed info={info} action="users.list">
            <IdentityList {...props} info={info} />
          </Allowed>
        )
      }
    </Frame>
  );
}
function IdentityList(props: IdentityPageProps & { info: AdministrationInfo }) {
  const workspace = useWorkspace();
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const read = useRead(props.client, "usersList", {
    search,
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  const writes = useWrites(read.refetch, () => setCursor(undefined));
  if (selected) {
    return (
      <>
        <Button variant="secondary" onClick={() => setSelected(undefined)}>
          Back to identities
        </Button>
        <IdentityDetail {...props} subjectId={selected} />
      </>
    );
  }
  return (
    <div {...stylex.props(s.section)}>
      {writes.controls}
      <ConsolePageScope
        scopeKey={workspace.activation?.key ?? workspace.mount.id}
        value={{ context: { kind: "object", label: "Identities" } }}
      />
      <Search
        label="Search identities"
        value={search}
        change={(value) => {
          setSearch(value);
          setCursor(undefined);
        }}
      />
      <ReadState read={read}>
        {read.data && (
          <>
            <Records
              label="Identities"
              items={read.data.items}
              rowKey={(user) => `${user.realmId}:${user.subjectId}`}
              columns={[
                {
                  id: "name",
                  label: "Identity",
                  render: (user) =>
                    props.info.allowed.includes("users.read") ? (
                      props.identityHref ? (
                        <a
                          href={props.identityHref(user.subjectId)}
                          onClick={(event) => {
                            if (
                              props.onNavigate &&
                              event.button === 0 &&
                              !event.metaKey &&
                              !event.ctrlKey &&
                              !event.shiftKey &&
                              !event.altKey
                            ) {
                              event.preventDefault();
                              props.onNavigate(
                                props.identityHref!(user.subjectId)
                              );
                            }
                          }}
                        >
                          {user.label}
                        </a>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => setSelected(user.subjectId)}
                        >
                          {user.label}
                        </Button>
                      )
                    ) : (
                      user.label
                    ),
                },
                {
                  id: "subject",
                  label: "Subject",
                  render: (user) => user.subjectId,
                },
                {
                  id: "source",
                  label: "Source",
                  render: (user) => user.source,
                },
                {
                  id: "status",
                  label: "Status",
                  render: (user) => user.status,
                },
              ]}
            />
            <Next cursor={read.data.nextCursor} next={setCursor} />
          </>
        )}
      </ReadState>
    </div>
  );
}
function IdentityDetail(
  props: IdentityPageProps & { subjectId: string; info: AdministrationInfo }
) {
  const workspace = useWorkspace();
  const read = useRead(props.client, "usersRead", {
    subjectId: props.subjectId,
  });
  const writes = useWrites(read.refetch);
  return (
    <div {...stylex.props(s.section)}>
      {writes.controls}
      <ConsolePageScope
        scopeKey={`${workspace.activation?.key ?? workspace.mount.id}:${props.subjectId}`}
        value={{
          context: {
            kind: "object",
            label: "Identity",
            id: props.subjectId,
            ...(props.returnHref && props.onNavigate
              ? {
                  return: {
                    label: "Back to identities",
                    onInvoke: () => props.onNavigate!(props.returnHref!),
                  },
                }
              : {}),
          },
        }}
      />
      <ReadState read={read}>
        {read.data ? (
          <>
            <h2>{read.data.label}</h2>
            <Facts
              entries={[
                ["Subject", read.data.subjectId],
                ["Realm", read.data.realmId],
                ["Source", read.data.source],
                ["Status", read.data.status],
              ]}
            />
            {props.info.supported.userDisable &&
              props.info.allowed.includes("users.disable") &&
              (props.info.allowed.includes("members.list") &&
              props.info.allowed.includes("roles.list") ? (
                <DisableIdentity
                  client={props.client}
                  user={read.data}
                  writes={writes}
                />
              ) : (
                <p>
                  Disabling identities requires permission to read both Console
                  members and roles to obtain the current safety revision.
                </p>
              ))}
            {props.info.supported.sessions ? (
              <Allowed info={props.info} action="sessions.list">
                <IdentitySessions {...props} writes={writes} />
              </Allowed>
            ) : (
              <p>
                This identity source does not support session administration.
              </p>
            )}
          </>
        ) : (
          <p>Identity not found.</p>
        )}
      </ReadState>
    </div>
  );
}
function DisableIdentity({
  client,
  user,
  writes,
}: AdministrationPageProps & { user: DirectoryUser; writes: Writes }) {
  const access = useRead(client, "accessRead", {});
  return (
    <div>
      {access.error && (
        <output>
          Disabling an identity requires access to the current Console safety
          revision. {errorText(access.error)}
        </output>
      )}
      <Button
        variant="danger-soft"
        disabled={
          writes.disabled ||
          !access.data ||
          !!access.error ||
          access.refreshing ||
          user.status !== "active"
        }
        onClick={() => {
          if (access.data) {
            const { revision } = access.data;
            writes.confirm(
              "Disable identity?",
              `Disable ${user.label} (${user.subjectId}) in ${user.realmId}.`,
              () =>
                client.invoke("usersDisable", {
                  subjectId: user.subjectId,
                  expectedRevision: revision,
                })
            );
          }
        }}
      >
        Disable identity
      </Button>
    </div>
  );
}
function IdentitySessions({
  client,
  subjectId,
  info,
  writes,
}: AdministrationPageProps & {
  subjectId: string;
  info: AdministrationInfo;
  writes: Writes;
}) {
  const [cursor, setCursor] = useState<string>();
  const read = useRead(client, "sessionsList", {
    subjectId,
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  return (
    <section aria-label="Identity sessions" {...stylex.props(s.section)}>
      <h3>Sessions</h3>
      <ReadState read={read}>
        {read.data && (
          <>
            <Records
              label="Sessions"
              items={read.data.items}
              rowKey={(item) => item.id}
              columns={[
                { id: "id", label: "Session", render: (item) => item.id },
                {
                  id: "created",
                  label: "Created",
                  render: (item) => date(item.createdAt),
                },
                {
                  id: "expires",
                  label: "Expires",
                  render: (item) => date(item.expiresAt),
                },
                {
                  id: "state",
                  label: "State",
                  render: (item) =>
                    item.revokedAt
                      ? "Revoked"
                      : item.expiresAt <= Date.now()
                        ? "Expired"
                        : "Active",
                },
                {
                  id: "action",
                  label: "Action",
                  render: (item) =>
                    info.supported.sessionRevoke &&
                    info.allowed.includes("sessions.revoke") ? (
                      <Button
                        variant="danger-soft"
                        disabled={
                          writes.disabled || !!item.revokedAt || read.refreshing
                        }
                        onClick={() =>
                          writes.confirm(
                            "Revoke session?",
                            `End session ${item.id} for ${subjectId}. Other sessions are unaffected.`,
                            () =>
                              client.invoke("sessionsRevoke", {
                                id: item.id,
                                subjectId,
                                expectedRevision: item.revision,
                              })
                          )
                        }
                      >
                        Revoke
                      </Button>
                    ) : (
                      "Unavailable"
                    ),
                },
              ]}
            />
            <Next cursor={read.data.nextCursor} next={setCursor} />
          </>
        )}
      </ReadState>
    </section>
  );
}

export function AccessPage({ client }: AdministrationPageProps) {
  return (
    <Frame client={client} label="Console access">
      {(info) =>
        info.allowed.includes("members.list") &&
        info.allowed.includes("roles.list") ? (
          <Access client={client} info={info} />
        ) : (
          <output>
            You need both members.list and roles.list permissions to view this
            combined Console access snapshot.
          </output>
        )
      }
    </Frame>
  );
}
function Access({
  client,
  info,
}: AdministrationPageProps & { info: AdministrationInfo }) {
  const workspace = useWorkspace();
  const tab = workspace.location.segments[0] === "roles" ? "roles" : "members";
  const read = useRead(client, "accessRead", {});
  const writes = useWrites(read.refetch);
  const [subject, setSubject] = useState("");
  const [roleId, setRoleId] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  return (
    <div {...stylex.props(s.section)}>
      <AdministrationTabs
        label="Console access"
        tabs={[
          { id: "members", label: "Members", segments: [] },
          { id: "roles", label: "Roles", segments: ["roles"] },
        ]}
      />
      {writes.controls}
      {tab === "roles" &&
        info.allowed.includes("roles.write") &&
        info.allowed.includes("members.promote") && (
          <ConsoleLayout.Corner area="topRight">
            <ConsoleIconButton
              label="Create role"
              variant="primary"
              disabled={writes.disabled || creatingRole}
              onClick={() => setCreatingRole(true)}
            >
              <Plus aria-hidden="true" />
            </ConsoleIconButton>
          </ConsoleLayout.Corner>
        )}
      <ReadState read={read}>
        {read.data && (
          <>
            <Facts
              entries={[
                ["Console", read.data.consoleId],
                ["Tenant", read.data.tenantId],
                ["Revision", read.data.revision],
              ]}
            />
            {tab === "members" ? (
              <>
                {info.allowed.includes("users.list") && (
                  <DirectoryPicker
                    client={client}
                    value={subject}
                    change={setSubject}
                  />
                )}
                {subject && <p>Selected subject: {subject}</p>}
                {(info.allowed.includes("members.write") ||
                  info.allowed.includes("members.promote")) && (
                  <div {...stylex.props(s.row)}>
                    <Choice
                      label="Membership role"
                      value={roleId}
                      change={setRoleId}
                      disabled={writes.disabled}
                      options={read.data.roles.map((role) => ({
                        value: role.id,
                        label: role.label,
                      }))}
                    />
                    {info.allowed.includes("members.write") && (
                      <Button
                        variant="primary"
                        disabled={
                          writes.disabled ||
                          read.refreshing ||
                          !subject ||
                          !roleId ||
                          !!read.data.roles
                            .find((role) => role.id === roleId)
                            ?.permissions.some(
                              (action) =>
                                !readOnlyAdministrationActions.includes(action)
                            )
                        }
                        onClick={() => {
                          const input = {
                            subjectId: subject,
                            roleId,
                            expectedRevision: read.data!.revision,
                          };
                          writes.confirm(
                            "Grant or update membership?",
                            `Assign role ${roleId} to ${subject} in ${info.consoleId}. Privilege elevation requires the separate promotion action.`,
                            () => client.invoke("membersSet", input)
                          );
                        }}
                      >
                        Grant membership
                      </Button>
                    )}
                    {info.allowed.includes("members.promote") && (
                      <Button
                        variant="danger-soft"
                        disabled={
                          writes.disabled ||
                          read.refreshing ||
                          !subject ||
                          !roleId
                        }
                        onClick={() => {
                          const input = {
                            subjectId: subject,
                            roleId,
                            expectedRevision: read.data!.revision,
                          };
                          writes.confirm(
                            "Promote member: sensitive access change",
                            `Elevate ${subject} to ${roleId} in Console ${info.consoleId}, tenant ${info.tenantId}. Review the role permissions before confirming.`,
                            () => client.invoke("membersPromote", input)
                          );
                        }}
                      >
                        Promote member
                      </Button>
                    )}
                  </div>
                )}
                <Records
                  label="Members"
                  items={read.data.members}
                  rowKey={(member) => `${member.realmId}:${member.subjectId}`}
                  columns={[
                    {
                      id: "subject",
                      label: "Subject",
                      render: (member) => (
                        <Button
                          variant="ghost"
                          xstyle={s.cellText}
                          onClick={() => setSubject(member.subjectId)}
                        >
                          <span {...stylex.props(s.cellText)}>
                            {member.subjectId}
                          </span>
                        </Button>
                      ),
                    },
                    {
                      id: "realm",
                      label: "Realm",
                      render: (member) => member.realmId,
                    },
                    {
                      id: "role",
                      label: "Role",
                      render: (member) => member.roleId,
                    },
                    {
                      id: "status",
                      label: "Status",
                      render: (member) => member.status,
                    },
                    {
                      id: "action",
                      label: "Action",
                      render: (member) =>
                        info.allowed.includes("members.write") ? (
                          <Button
                            variant="danger-soft"
                            disabled={
                              writes.disabled ||
                              read.refreshing ||
                              member.status === "revoked"
                            }
                            onClick={() => {
                              const input = {
                                subjectId: member.subjectId,
                                expectedRevision: read.data!.revision,
                              };
                              writes.confirm(
                                "Revoke Console membership?",
                                `Remove ${member.subjectId}'s membership in ${info.consoleId}. This does not delete their identity.`,
                                () => client.invoke("membersRevoke", input)
                              );
                            }}
                          >
                            Revoke
                          </Button>
                        ) : (
                          "Unavailable"
                        ),
                    },
                  ]}
                />
                {subject && info.allowed.includes("permissions.read") && (
                  <Permissions
                    key={subject}
                    client={client}
                    subjectId={subject}
                  />
                )}
              </>
            ) : (
              <>
                {creatingRole && (
                  <RoleCreator
                    client={client}
                    info={info}
                    revision={read.data.revision}
                    writes={writes}
                    templates={read.data.roles.filter((role) => role.preset)}
                    onClose={() => setCreatingRole(false)}
                  />
                )}
                {read.data.roles.map((role) => (
                  <RoleEditor
                    key={`${read.data!.revision}:${role.id}`}
                    client={client}
                    info={info}
                    role={role}
                    revision={read.data!.revision}
                    writes={writes}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ReadState>
    </div>
  );
}
function DirectoryPicker({
  client,
  value,
  change,
}: AdministrationPageProps & {
  value: string;
  change: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string>();
  const read = useRead(client, "usersList", {
    search,
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  return (
    <section aria-label="Select existing identity" {...stylex.props(s.section)}>
      <Search
        label="Search existing identities"
        value={search}
        change={(text) => {
          setSearch(text);
          setCursor(undefined);
        }}
      />
      <ReadState read={read}>
        {read.data && (
          <>
            <Choice
              label="Existing identity"
              value={value}
              change={change}
              options={[
                ...(value &&
                !read.data.items.some((user) => user.subjectId === value)
                  ? [{ value, label: value }]
                  : []),
                ...read.data.items.map((user) => ({
                  value: user.subjectId,
                  label: `${user.label} (${user.subjectId}, ${user.realmId})`,
                })),
              ]}
            />
            {!read.data.items.length && <p>No identities match this search.</p>}
            <Next cursor={read.data.nextCursor} next={setCursor} />
          </>
        )}
      </ReadState>
    </section>
  );
}
function Permissions({
  client,
  subjectId,
}: AdministrationPageProps & { subjectId: string }) {
  const read = useRead(client, "permissionsRead", { subjectId });
  return (
    <section aria-label="Effective permissions" {...stylex.props(s.section)}>
      <h3>Effective permissions</h3>
      <ReadState read={read}>
        {read.data && (
          <>
            <p>
              {read.data.allowed.length
                ? read.data.allowed.join(", ")
                : "No effective permissions."}
            </p>
            <Records
              label="Permission sources"
              items={read.data.sources}
              rowKey={(source) => source.roleId}
              columns={[
                {
                  id: "role",
                  label: "Source role",
                  render: (source) => source.roleId,
                },
                {
                  id: "permissions",
                  label: "Permissions",
                  render: (source) => source.permissions.join(", ") || "None",
                },
              ]}
            />
          </>
        )}
      </ReadState>
    </section>
  );
}
function PermissionChoices({
  allowed,
  choices = allowed,
  selected,
  change,
  disabled,
}: {
  allowed: readonly AdministrationAction[];
  choices?: readonly AdministrationAction[];
  selected: readonly AdministrationAction[];
  change: (actions: AdministrationAction[]) => void;
  disabled: boolean;
}) {
  const labelPrefix = useId();
  return (
    <fieldset disabled={disabled} {...stylex.props(s.permissions)}>
      <legend>Permissions</legend>
      {choices
        .filter((action) => allowed.includes(action))
        .map((action) => (
          <div key={action} {...stylex.props(s.choice)}>
            <Checkbox
              aria-labelledby={`${labelPrefix}-${action}`}
              xstyle={s.choice}
              checked={selected.includes(action)}
              onCheckedChange={(checked) =>
                change(
                  checked
                    ? [...selected, action]
                    : selected.filter((item) => item !== action)
                )
              }
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content id={`${labelPrefix}-${action}`}>
                {action}
              </Checkbox.Content>
            </Checkbox>
          </div>
        ))}
    </fieldset>
  );
}
function RoleCreator({
  client,
  info,
  revision,
  templates,
  writes,
  onClose,
}: AdministrationPageProps & {
  info: AdministrationInfo;
  revision: string;
  templates: readonly ConsoleRole[];
  writes: Writes;
  onClose(): void;
}) {
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [template, setTemplate] = useState("");
  const [permissions, setPermissions] = useState<
    readonly AdministrationAction[]
  >(
    readOnlyAdministrationActions.filter((action) =>
      info.allowed.includes(action)
    )
  );
  return (
    <section aria-label="Create custom role" {...stylex.props(s.section)}>
      <h3>Create custom role</h3>
      <Choice
        label="Role template"
        value={template}
        options={templates.map((role) => ({
          value: role.id,
          label: role.label,
        }))}
        disabled={writes.disabled}
        change={(templateId) => {
          setTemplate(templateId);
          setPermissions(
            templates
              .find((role) => role.id === templateId)
              ?.permissions.filter((action) => info.allowed.includes(action)) ??
              []
          );
        }}
      />
      <p>
        Templates copy permissions into this Console-scoped role; they do not
        grant membership.
      </p>
      <label htmlFor="administration-role-id" {...stylex.props(s.field)}>
        Role ID
        <Input
          id="administration-role-id"
          value={id}
          onChange={(event) => setId(event.target.value)}
          disabled={writes.disabled}
          xstyle={s.control}
          maxLength={512}
        />
      </label>
      <label htmlFor="administration-role-name" {...stylex.props(s.field)}>
        Role name
        <Input
          id="administration-role-name"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={writes.disabled}
          xstyle={s.control}
          maxLength={512}
        />
      </label>
      <PermissionChoices
        allowed={info.allowed}
        selected={permissions}
        change={setPermissions}
        disabled={writes.disabled}
      />
      <Button
        variant="primary"
        disabled={
          writes.disabled ||
          !id.trim() ||
          !label.trim() ||
          templates.some((role) => role.id === id)
        }
        onClick={() => {
          const input = {
            id,
            label,
            permissions: [...permissions],
            expectedRevision: revision,
          };
          writes.confirm(
            "Create custom role?",
            `Create ${label} (${id}) in ${info.consoleId}.`,
            async () => {
              await client.invoke("rolesSave", input);
              onClose();
            }
          );
        }}
      >
        Create custom role
      </Button>
      <Button variant="secondary" disabled={writes.pending} onClick={onClose}>
        Cancel creation
      </Button>
    </section>
  );
}

function RoleEditor({
  client,
  info,
  role,
  revision,
  writes,
}: AdministrationPageProps & {
  info: AdministrationInfo;
  role: ConsoleRole;
  revision: string;
  writes: Writes;
}) {
  const [permissions, setPermissions] = useState<
    readonly AdministrationAction[]
  >(role.permissions);
  const editable =
    info.allowed.includes("roles.write") &&
    info.allowed.includes("members.promote") &&
    !role.preset &&
    role.permissions.every((action) => info.allowed.includes(action));
  return (
    <section aria-label={`Role ${role.label}`} {...stylex.props(s.section)}>
      <h3>
        {role.label}
        {role.preset ? " (preset)" : ""}
      </h3>
      <p>{role.permissions.join(", ") || "No permissions."}</p>
      {!role.preset && !editable && (
        <p>
          Editing this role requires roles.write, members.promote and authority
          for every permission it contains.
        </p>
      )}
      {editable && (
        <>
          <PermissionChoices
            allowed={info.allowed}
            selected={permissions}
            change={setPermissions}
            disabled={writes.disabled}
          />
          <Button
            variant="primary"
            disabled={writes.disabled}
            onClick={() =>
              writes.confirm(
                "Save role permissions?",
                `Update role ${role.label} (${role.id}). This affects every member assigned to this role.`,
                () =>
                  client.invoke("rolesSave", {
                    id: role.id,
                    label: role.label,
                    permissions,
                    expectedRevision: revision,
                  })
              )
            }
          >
            Save permissions
          </Button>
        </>
      )}
    </section>
  );
}

export function AgentPage({ client }: AdministrationPageProps) {
  return (
    <Frame client={client} label="Agent">
      {(info) => <Agent client={client} info={info} />}
    </Frame>
  );
}
function Agent({
  client,
  info,
}: AdministrationPageProps & { info: AdministrationInfo }) {
  const workspace = useWorkspace();
  const tab =
    workspace.location.segments[0] === "events" &&
    info.allowed.includes("audit.list")
      ? "audit"
      : "tokens";
  return (
    <div {...stylex.props(s.section)}>
      <AdministrationTabs
        label="Agent connections"
        tabs={[
          { id: "tokens", label: "Personal tokens", segments: [] },
          ...(info.allowed.includes("audit.list")
            ? [{ id: "audit", label: "Observed events", segments: ["events"] }]
            : []),
        ]}
      />
      <Facts
        entries={[
          ["MCP URL", info.mcpUrl],
          ["Authentication", "Personal access token"],
          ["Last observed call", date(info.observedLastCallAt)],
        ]}
      />
      <p>
        Configure your MCP client with the URL above. Store your personal access
        token in the client environment as <code>LENSO_MCP_TOKEN</code>, then
        use custom Bearer token authentication in the client. This is not OAuth.
        Do not paste it into a URL or commit it to configuration.
      </p>
      <p>
        An observed call is historical activity, not proof that an agent is
        currently connected.
      </p>
      {tab === "tokens" ? (
        <Allowed info={info} action="tokens.list">
          <Tokens client={client} info={info} />
        </Allowed>
      ) : (
        <Allowed info={info} action="audit.list">
          <Audit client={client} />
        </Allowed>
      )}
    </div>
  );
}
function Tokens({
  client,
  info,
}: AdministrationPageProps & { info: AdministrationInfo }) {
  const [cursor, setCursor] = useState<string>();
  const read = useRead(client, "tokensList", {
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  const writes = useWrites(read.refetch, () => setCursor(undefined));
  const [scopes, setScopes] = useState<readonly AdministrationAction[]>(
    defaultTokenScopes.filter((scope) => info.allowed.includes(scope))
  );
  const [expiry, setExpiry] = useState(() => localDateTimeAfter(7));
  const [delivery, setDelivery] = useState<CredentialDelivery | null>(null);
  const lifetime = useRef({ value: 0 });
  const expiryId = useId();
  useEffect(() => {
    const generation = lifetime.current;
    generation.value += 1;
    return () => {
      generation.value += 1;
    };
  }, []);
  async function deliver(work: () => Promise<CredentialDelivery>) {
    const generation = lifetime.current.value;
    setDelivery(null);
    const result = await work();
    if (lifetime.current.value === generation) {
      setDelivery(result);
    }
  }
  const expiresAt = new Date(expiry).getTime();
  return (
    <section aria-label="Own personal tokens" {...stylex.props(s.section)}>
      {writes.controls}
      {delivery && (
        <section aria-label="One-time credential" {...stylex.props(s.section)}>
          <h3>Save your token now</h3>
          <p>
            This credential is displayed once and held only in page memory.
            Dismiss this view after saving it in your client environment.
          </p>
          {delivery.credential ? (
            <pre {...stylex.props(s.secret)}>{delivery.credential}</pre>
          ) : (
            <p>
              The credential is no longer available. Inspect the token before
              rotating it; do not automatically repeat issuance.
            </p>
          )}
          <Button variant="secondary" onClick={() => setDelivery(null)}>
            Dismiss credential
          </Button>
        </section>
      )}
      {info.allowed.includes("tokens.issue") && (
        <section
          aria-label="Create personal token"
          {...stylex.props(s.section)}
        >
          <h3>Create personal token</h3>
          <Button
            variant="secondary"
            disabled={writes.disabled}
            onClick={() =>
              setScopes(
                defaultTokenScopes.filter((scope) =>
                  info.allowed.includes(scope)
                )
              )
            }
          >
            Apply read-only preset
          </Button>
          <PermissionChoices
            allowed={info.allowed}
            choices={tokenReadScopes}
            selected={scopes}
            change={setScopes}
            disabled={writes.disabled}
          />
          <label htmlFor={expiryId} {...stylex.props(s.field)}>
            Expiry (local time)
            <Input
              id={expiryId}
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              xstyle={s.control}
              disabled={writes.disabled}
            />
          </label>
          <Button
            variant="primary"
            disabled={
              writes.disabled ||
              !scopes.length ||
              !Number.isFinite(expiresAt) ||
              expiresAt <= Date.now()
            }
            onClick={() => {
              const input = {
                scopes: [...scopes],
                expiresAt,
                requestId: crypto.randomUUID(),
              };
              writes.confirm(
                "Create personal token?",
                `Issue a personal token with ${scopes.join(", ")} until ${date(expiresAt)}. Save its one-time credential securely.`,
                () => deliver(() => client.issueToken(input))
              );
            }}
          >
            Create token
          </Button>
        </section>
      )}
      <ReadState read={read}>
        {read.data && (
          <>
            <Records
              label="Personal tokens"
              items={read.data.items}
              rowKey={(token) => token.id}
              columns={[
                {
                  id: "id",
                  label: "Token",
                  render: (token) => (
                    <>
                      {token.id}
                      <p>{token.scopes.join(", ")}</p>
                    </>
                  ),
                },
                {
                  id: "expires",
                  label: "Expiry",
                  render: (token) => date(token.expiresAt),
                },
                {
                  id: "state",
                  label: "State",
                  render: (token) => (
                    <>
                      {token.revokedAt
                        ? "Revoked"
                        : token.expiresAt <= Date.now()
                          ? "Expired"
                          : "Active"}
                      {token.overlapUntil !== null && (
                        <p>Rotation overlap until {date(token.overlapUntil)}</p>
                      )}
                    </>
                  ),
                },
                {
                  id: "actions",
                  label: "Actions",
                  render: (token) => (
                    <div {...stylex.props(s.row)}>
                      {info.allowed.includes("tokens.rotate") && (
                        <Button
                          variant="secondary"
                          disabled={
                            writes.disabled ||
                            read.refreshing ||
                            !!token.revokedAt ||
                            token.expiresAt <= Date.now()
                          }
                          onClick={() =>
                            writes.confirm(
                              "Rotate personal token?",
                              `Replace ${token.id}. The previous credential will stop working immediately. Update your MCP client with the new one-time credential.`,
                              () =>
                                deliver(() =>
                                  client.rotateToken({
                                    id: token.id,
                                    expectedRevision: token.revision,
                                    overlapMs: 0,
                                  })
                                )
                            )
                          }
                        >
                          Rotate
                        </Button>
                      )}
                      {info.allowed.includes("tokens.revoke") && (
                        <Button
                          variant="danger-soft"
                          disabled={
                            writes.disabled ||
                            read.refreshing ||
                            !!token.revokedAt
                          }
                          onClick={() =>
                            writes.confirm(
                              "Revoke personal token?",
                              `End access using token ${token.id}. Clients using it will need another credential.`,
                              () =>
                                client.invoke("tokensRevoke", {
                                  id: token.id,
                                  expectedRevision: token.revision,
                                })
                            )
                          }
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <Next cursor={read.data.nextCursor} next={setCursor} />
          </>
        )}
      </ReadState>
    </section>
  );
}
function Audit({ client }: AdministrationPageProps) {
  const [cursor, setCursor] = useState<string>();
  const read = useRead(client, "auditList", {
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  const writes = useWrites(read.refetch, () => setCursor(undefined));
  return (
    <section
      aria-label="Observed management events"
      {...stylex.props(s.section)}
    >
      {writes.controls}
      <ReadState read={read}>
        {read.data && (
          <>
            <Records
              label="Observed events"
              items={read.data.items}
              rowKey={(event) => event.id}
              columns={[
                {
                  id: "time",
                  label: "Observed at",
                  render: (event) => date(event.occurredAt),
                },
                {
                  id: "action",
                  label: "Action",
                  render: (event) => event.action,
                },
                {
                  id: "subject",
                  label: "Subject",
                  render: (event) => event.subjectId,
                },
                {
                  id: "target",
                  label: "Target",
                  render: (event) => event.targetId,
                },
                {
                  id: "result",
                  label: "Result",
                  render: (event) => event.result,
                },
              ]}
            />
            <Next cursor={read.data.nextCursor} next={setCursor} />
          </>
        )}
      </ReadState>
    </section>
  );
}
export function ConsoleAdministrationPages({
  page,
  ...props
}: IdentityPageProps & { page: "identity" | "access" | "agent" }) {
  if (page === "identity") {
    return <IdentityPage {...props} />;
  }
  if (page === "access") {
    return <AccessPage client={props.client} />;
  }
  return <AgentPage client={props.client} />;
}
