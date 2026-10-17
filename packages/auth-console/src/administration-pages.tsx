import {
  ConsoleIconButton,
  ConsolePageScope,
  ConsoleTableContext,
  ConsoleTableSearch,
  evaluateConsoleFilter,
  type ConsoleFilterCondition,
  type ConsoleFilterField,
  type ConsoleFilterGroup,
  type ConsoleFilterNode,
} from "@lenso/console-react";
import { consoleInputIssuesSchema } from "@lenso/console-sdk/protocol";
// Records invokes its cell formatters, never mounts them as React component types.
/* eslint-disable react/no-unstable-nested-components */
import {
  useWorkspace,
  useWorkspaceRead,
  useWorkspaceReadClient,
} from "@lenso/console-sdk/react";
import { ThemeScope } from "@lenso/ui";
import { Accordion } from "@lenso/ui/accordion";
import { AlertDialog } from "@lenso/ui/alert-dialog";
import { Button } from "@lenso/ui/button";
import { Checkbox } from "@lenso/ui/checkbox";
import { Description } from "@lenso/ui/description";
import { Drawer } from "@lenso/ui/drawer";
import { FieldError } from "@lenso/ui/field-error";
import { Form } from "@lenso/ui/form";
import { Input } from "@lenso/ui/input";
import { Label } from "@lenso/ui/label";
import { Modal } from "@lenso/ui/modal";
import { Pagination } from "@lenso/ui/pagination";
import { Popover } from "@lenso/ui/popover";
import { SearchField } from "@lenso/ui/search-field";
import { Select } from "@lenso/ui/select";
import { Table } from "@lenso/ui/table";
import { TextField } from "@lenso/ui/textfield";
import * as stylex from "@stylexjs/stylex";
import { Info, Plus, X } from "lucide-react";
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";

import type {
  AdministrationAction,
  AdministrationClient,
  AdministrationInfo,
  AdministrationInputs,
  AccessSnapshot,
  ConsoleRole,
  CredentialDelivery,
  DirectoryUser,
  DirectoryFilter,
  PersonalToken,
  ManagementEvent,
} from "./administration-contracts";
import { readOnlyAdministrationActions } from "./administration-contracts";
import { administrationStyles as s } from "./administration-styles";
import { TokenCredentialDialog } from "./token-credential-dialog";

export interface AdministrationPageProps {
  client: AdministrationClient;
  /** Set to host when the Shell supplies persistent pageGroups. */
  tabs?: "workspace" | "host";
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
  reloadLabel = "Reload data",
}: {
  read: {
    blocking: boolean;
    refreshing: boolean;
    error: Error | null;
    data: unknown;
    refetch: () => Promise<void>;
  };
  children: ReactNode;
  reloadLabel?: string;
}) {
  if (read.blocking) {
    return <output>Loading…</output>;
  }
  if (read.error) {
    return (
      <>
        <p role="alert" {...stylex.props(s.error)}>
          {errorText(read.error)}
        </p>
        <Button
          variant="secondary"
          disabled={read.refreshing}
          onClick={async () => {
            try {
              await read.refetch();
            } catch {
              // The read snapshot retains the error for another explicit retry.
            }
          }}
        >
          {reloadLabel}
        </Button>
      </>
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
      <ReadState read={read} reloadLabel="Reload permissions">
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
  navigation,
  mode = "embedded",
}: {
  label: string;
  items: readonly T[];
  rowKey: (item: T) => string;
  navigation?: ReactNode;
  mode?: "page" | "embedded";
  columns: readonly {
    id: string;
    label: string;
    width?: ComponentProps<typeof Table.Column>["width"];
    minWidth?: number;
    render: (item: T) => ReactNode;
  }[];
}) {
  const workspace = useWorkspace();
  const content =
    items.length === 0 ? (
      <p>No {label.toLowerCase()} found.</p>
    ) : (
      <Table.Root variant="secondary">
        <Table.ScrollContainer>
          <Table.Content aria-label={label} xstyle={s.table}>
            <Table.Header>
              {columns.map((column) => (
                <Table.Column
                  key={column.id}
                  columnKey={column.id}
                  {...(column.width === undefined
                    ? {}
                    : { width: column.width })}
                  minWidth={column.minWidth ?? 120}
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
  return navigation ? (
    <ConsoleTableContext
      scopeKey={workspace.activation?.key ?? workspace.mount.id}
      label={label}
      mode={mode}
      groups={[
        {
          id: "navigation",
          kind: "navigation",
          label: "Pagination",
          children: navigation,
        },
      ]}
    >
      {content}
    </ConsoleTableContext>
  ) : (
    content
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
  count,
}: {
  cursor: string | null | undefined;
  next: (cursor: string) => void;
  count?: number;
}) {
  const disabled = !cursor;
  return (
    <Pagination aria-label="Cursor pagination" xstyle={s.pagination}>
      {count !== undefined && (
        <Pagination.Summary>{count} on this page</Pagination.Summary>
      )}
      <Pagination.Content>
        <Pagination.Item>
          <ConsoleIconButton
            label="Next page"
            tooltip={disabled ? "No next page" : "Next page"}
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              if (cursor) {
                return next(cursor);
              }
            }}
          >
            <Pagination.NextIcon />
          </ConsoleIconButton>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}
// Modal and drawer selects must stay inside their owner's accessible subtree.
const AdministrationPortalContext = createContext<HTMLElement | null>(null);

function Choice({
  label,
  value,
  change,
  options,
  disabled = false,
  placeholder = "Choose…",
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  options: readonly { value: string; label: string }[];
}) {
  const portal = useContext(AdministrationPortalContext);
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
          <Select.Value placeholder={placeholder} />
          <Select.Indicator />
        </Select.Trigger>
        <ThemeScope>
          <Select.Portal container={portal ?? undefined}>
            <Select.Positioner
              sideOffset={8}
              alignItemWithTrigger={portal === null}
            >
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
  afterReload?: () => void,
  afterConfirmationClose?: () => void
) {
  const cache = useWorkspaceReadClient();
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    detail: string;
    run: () => Promise<unknown>;
    invalid?: (paths: readonly (readonly string[])[]) => void;
  } | null>(null);
  const confirmationRef = useRef(confirmation);
  const [validationFailed, setValidationFailed] = useState(false);
  function closeConfirmation() {
    confirmationRef.current = null;
    setConfirmation(null);
  }
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
      confirmationRef.current = null;
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
    if (lock.current || blocked || !confirmationRef.current) {
      return;
    }
    lock.current = true;
    setPending(true);
    const generation = lifetime.current.value;
    const target = confirmationRef.current;
    setValidationFailed(false);
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
        const issues =
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "UNPROCESSABLE_CONTENT" &&
          "inputIssues" in error
            ? consoleInputIssuesSchema.safeParse(error.inputIssues)
            : undefined;
        if (issues?.success) {
          target.invalid?.(issues.data);
          setValidationFailed(true);
          setFeedback(
            "Check the form fields and try again. No change was applied."
          );
          return;
        }
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
        closeConfirmation();
        lock.current = false;
        setPending(false);
      }
    }
  }
  return {
    pending,
    confirming: confirmation !== null,
    disabled: pending || blocked || confirmation !== null,
    confirm(
      title: string,
      detail: string,
      run: () => Promise<unknown>,
      invalid?: (paths: readonly (readonly string[])[]) => void
    ) {
      if (!lock.current && !blocked && !confirmationRef.current) {
        opener.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const next = { title, detail, run, ...(invalid ? { invalid } : {}) };
        confirmationRef.current = next;
        setValidationFailed(false);
        setFeedback("");
        setConfirmation(next);
      }
    },
    controls: (
      <>
        {blocked && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => void reload()}
          >
            Reload administration data
          </Button>
        )}
        {feedback && (
          <p
            ref={feedbackNode}
            tabIndex={-1}
            role={blocked || validationFailed ? "alert" : "status"}
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
          onOpenChangeComplete={(open) => {
            if (!open) {
              afterConfirmationClose?.();
            }
          }}
          onOpenChange={(open, details) => {
            if (lock.current) {
              details.cancel();
            } else if (!open) {
              closeConfirmation();
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
                    onClick={closeConfirmation}
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
function identityFilterInput(
  conditions: readonly ConsoleFilterCondition[]
): Pick<AdministrationInputs["usersList"], "status" | "name"> {
  const statusCondition = conditions.find(
    (condition) => condition.field === "status"
  );
  const status =
    statusCondition?.operator === "equals" &&
    (statusCondition.value === "active" ||
      statusCondition.value === "disabled" ||
      statusCondition.value === "external")
      ? statusCondition.value
      : undefined;
  const nameCondition = conditions.find(
    (condition) => condition.field === "name"
  );
  const name =
    nameCondition &&
    (nameCondition.operator === "contains" ||
      nameCondition.operator === "equals")
      ? { operator: nameCondition.operator, value: nameCondition.value }
      : undefined;
  return { ...(status ? { status } : {}), ...(name ? { name } : {}) };
}

function identityFilterFields(info: AdministrationInfo): ConsoleFilterField[] {
  const fields: ConsoleFilterField[] = [];
  if (info.supported.userNameFilter || info.supported.userFilterGroups) {
    fields.push({
      id: "name",
      label: "Name",
      kind: "text",
      operators: ["contains", "equals"],
      maxLength: 512,
    });
  }
  if (info.supported.userStatusFilter || info.supported.userFilterGroups) {
    fields.push({
      id: "status",
      label: "Status",
      kind: "enum",
      options: [
        { value: "active", label: "Active" },
        { value: "disabled", label: "Disabled" },
        { value: "external", label: "External" },
      ],
    });
  }
  return fields;
}

function identityFilterTree(node: ConsoleFilterNode): DirectoryFilter {
  if ("children" in node) {
    return {
      operator: node.operator,
      children: node.children.map(identityFilterTree),
    };
  }
  if (
    node.field === "name" &&
    (node.operator === "contains" || node.operator === "equals")
  ) {
    return { field: "name", operator: node.operator, value: node.value };
  }
  if (
    node.field === "status" &&
    node.operator === "equals" &&
    (node.value === "active" ||
      node.value === "disabled" ||
      node.value === "external")
  ) {
    return { field: "status", operator: "equals", value: node.value };
  }
  throw new Error("Unsupported directory filter");
}

function IdentityList(props: IdentityPageProps & { info: AdministrationInfo }) {
  const workspace = useWorkspace();
  const [search, setSearch] = useState("");
  const [conditions, setConditions] = useState<
    readonly ConsoleFilterCondition[]
  >([]);
  const [filter, setFilter] = useState<ConsoleFilterGroup>({
    id: "identities",
    operator: "and",
    children: [],
  });
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const fields = identityFilterFields(props.info);
  const read = useRead(props.client, "usersList", {
    search,
    ...(props.info.supported.userFilterGroups
      ? { filter: identityFilterTree(filter) }
      : identityFilterInput(conditions)),
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
      <ConsoleTableContext
        scopeKey={workspace.activation?.key ?? workspace.mount.id}
        label="Identities"
        filters={
          fields.length > 0
            ? {
                label: "Filter identities",
                ...(props.info.supported.userFilterGroups
                  ? {
                      value: filter,
                      onValueChange: (value: ConsoleFilterGroup) => {
                        setFilter(value);
                        setCursor(undefined);
                      },
                    }
                  : {
                      conditions,
                      onConditionsChange: (
                        value: readonly ConsoleFilterCondition[]
                      ) => {
                        setConditions(value);
                        setCursor(undefined);
                      },
                    }),
                fields,
              }
            : undefined
        }
        groups={[
          {
            id: "query",
            kind: "query",
            label: "Search",
            children: (
              <ConsoleTableSearch
                label="Search identities"
                value={search}
                onValueChange={(value) => {
                  setSearch(value);
                  setCursor(undefined);
                }}
              />
            ),
          },
          ...(read.data && !read.error
            ? [
                {
                  id: "navigation",
                  kind: "navigation" as const,
                  label: "Pagination",
                  children: (
                    <Next
                      cursor={read.data.nextCursor}
                      next={setCursor}
                      count={read.data.items.length}
                    />
                  ),
                },
              ]
            : []),
        ]}
      >
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
            </>
          )}
        </ReadState>
      </ConsoleTableContext>
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
              navigation={
                <Next
                  cursor={read.data.nextCursor}
                  next={setCursor}
                  count={read.data.items.length}
                />
              }
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
          </>
        )}
      </ReadState>
    </section>
  );
}

export function AccessPage({
  client,
  tabs = "workspace",
}: AdministrationPageProps) {
  return (
    <Frame client={client} label="Console access">
      {(info) =>
        info.allowed.includes("members.list") &&
        info.allowed.includes("roles.list") ? (
          <Access client={client} info={info} tabs={tabs} />
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
  tabs = "workspace",
}: AdministrationPageProps & { info: AdministrationInfo }) {
  const workspace = useWorkspace();
  const tab = workspace.location.segments[0] === "roles" ? "roles" : "members";
  const read = useRead(client, "accessRead", {});
  const writes = useWrites(read.refetch);
  const [subject, setSubject] = useState("");
  const [roleId, setRoleId] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const [roleQuery, setRoleQuery] = useState("");
  const [roleEditor, setRoleEditor] = useState({ id: "", open: false });
  const roleEntry = useRef<HTMLHeadingElement>(null);
  const roleOpener = useRef<HTMLElement | null>(null);
  const roleList = useRef<HTMLDivElement>(null);
  const [membershipEditor, setMembershipEditor] = useState<{
    mode: "add" | "edit";
    open: boolean;
  }>({ mode: "add", open: false });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConsoleFilterGroup>({
    id: "members",
    operator: "and",
    children: [],
  });
  const membershipMode = membershipEditor.mode;
  const editingMembership = membershipEditor.open;
  const membershipEntry = useRef<HTMLHeadingElement>(null);
  const membershipOpener = useRef<HTMLElement | null>(null);
  const memberList = useRef<HTMLDivElement>(null);
  const visibleMembers =
    read.data?.members.filter((member) => {
      const role = read.data!.roles.find((item) => item.id === member.roleId);
      return (
        `${member.subjectId} ${member.realmId} ${role?.label ?? member.roleId}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()) &&
        evaluateConsoleFilter(filter, (condition) => {
          if (condition.field !== "role" && condition.field !== "status") {
            return false;
          }
          const value =
            condition.field === "role" ? member.roleId : member.status;
          return condition.operator === "equals" && value === condition.value;
        })
      );
    }) ?? [];
  const selectedMember = read.data?.members.find(
    (member) => member.subjectId === subject
  );
  const selectedRole = read.data?.roles.find(
    (role) => role.id === roleEditor.id
  );
  const visibleRoles =
    read.data?.roles.filter((role) =>
      `${role.label} ${role.id} ${role.permissions.join(" ")}`
        .toLowerCase()
        .includes(roleQuery.trim().toLowerCase())
    ) ?? [];
  const roleReturnFocus = () =>
    roleOpener.current?.isConnected
      ? roleOpener.current
      : (roleList.current ?? false);
  function closeRole() {
    if (!writes.pending && !writes.confirming) {
      setRoleEditor((current) => ({ ...current, open: false }));
    }
  }
  function closeMembership() {
    if (!writes.pending && !writes.confirming) {
      setMembershipEditor((current) => ({ ...current, open: false }));
    }
  }
  return (
    <div {...stylex.props(s.section)}>
      {tabs === "workspace" && (
        <AdministrationTabs
          label="Console access"
          tabs={[
            { id: "members", label: "Members", segments: [] },
            { id: "roles", label: "Roles", segments: ["roles"] },
          ]}
        />
      )}
      {!editingMembership &&
        !creatingRole &&
        !roleEditor.open &&
        writes.controls}
      <ReadState read={read}>
        {read.data && (
          <>
            {tab === "members" ? (
              <ConsoleTableContext
                scopeKey={workspace.activation?.key ?? workspace.mount.id}
                label="Members"
                filters={{
                  label: "Filter members",
                  value: filter,
                  onValueChange: setFilter,
                  fields: [
                    {
                      id: "role",
                      label: "Role",
                      kind: "enum",
                      options: read.data.roles.map((role) => ({
                        value: role.id,
                        label: role.label,
                      })),
                    },
                    {
                      id: "status",
                      label: "Status",
                      kind: "enum",
                      options: [
                        { value: "active", label: "Active" },
                        { value: "revoked", label: "Revoked" },
                      ],
                    },
                  ],
                }}
                groups={[
                  {
                    id: "scope",
                    kind: "view",
                    label: "Access scope",
                    placement: "bottomLeft",
                    children: <AccessScope snapshot={read.data} />,
                  },
                  {
                    id: "query",
                    kind: "query",
                    label: "Search",
                    children: (
                      <ConsoleTableSearch
                        label="Search members"
                        value={query}
                        onValueChange={setQuery}
                      />
                    ),
                  },
                  ...(info.allowed.includes("users.list") &&
                  (info.allowed.includes("members.write") ||
                    info.allowed.includes("members.promote"))
                    ? [
                        {
                          id: "add",
                          kind: "insertion" as const,
                          label: "Membership",
                          children: (
                            <ConsoleIconButton
                              label="Add member"
                              variant="primary"
                              disabled={writes.disabled || editingMembership}
                              onClick={(event) => {
                                membershipOpener.current = event.currentTarget;
                                setSubject("");
                                setRoleId("");
                                setMembershipEditor({
                                  mode: "add",
                                  open: true,
                                });
                              }}
                            >
                              <Plus size={18} aria-hidden="true" />
                            </ConsoleIconButton>
                          ),
                        },
                      ]
                    : []),
                ]}
              >
                <>
                  <div
                    ref={memberList}
                    tabIndex={-1}
                    {...stylex.props(s.accessList)}
                  >
                    {visibleMembers.length ? (
                      <Records
                        label="Members"
                        items={visibleMembers}
                        rowKey={(member) =>
                          `${member.realmId}:${member.subjectId}`
                        }
                        columns={[
                          {
                            id: "subject",
                            label: "Member",
                            width: "1.5fr",
                            minWidth: 176,
                            render: (member) => (
                              <Button
                                variant="ghost"
                                xstyle={[s.subjectButton, s.memberButton]}
                                aria-label={`Inspect member ${member.subjectId}`}
                                disabled={writes.pending}
                                onClick={(event) => {
                                  membershipOpener.current =
                                    event.currentTarget;
                                  setSubject(member.subjectId);
                                  setRoleId(member.roleId);
                                  setMembershipEditor({
                                    mode: "edit",
                                    open: true,
                                  });
                                }}
                              >
                                <span {...stylex.props(s.memberIdentity)}>
                                  {member.subjectId}
                                </span>
                                <span {...stylex.props(s.accessSecondary)}>
                                  {member.realmId}
                                </span>
                              </Button>
                            ),
                          },
                          {
                            id: "role",
                            label: "Role",
                            width: "1fr",
                            minWidth: 136,
                            render: (member) =>
                              read.data!.roles.find(
                                (role) => role.id === member.roleId
                              )?.label ?? member.roleId,
                          },
                          {
                            id: "status",
                            label: "Status",
                            width: 96,
                            minWidth: 88,
                            render: (member) => (
                              <span {...stylex.props(s.accessSecondary)}>
                                {member.status === "active"
                                  ? "Active"
                                  : "Revoked"}
                              </span>
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <p {...stylex.props(s.accessSecondary)}>
                        {read.data.members.length
                          ? "No members match this search and filter."
                          : "No Console members."}
                      </p>
                    )}
                  </div>
                  <AdministrationSurface
                    presentation={membershipMode === "add" ? "modal" : "drawer"}
                    open={editingMembership}
                    busy={writes.pending || writes.confirming}
                    title={membershipMode === "add" ? "Add member" : subject}
                    description={
                      membershipMode === "add"
                        ? "Choose an existing identity to grant Console access."
                        : (selectedMember?.realmId ?? info.realmId)
                    }
                    initialFocus={membershipEntry}
                    finalFocus={() =>
                      membershipOpener.current?.isConnected
                        ? membershipOpener.current
                        : (memberList.current ?? false)
                    }
                    onClose={closeMembership}
                    closeLabel="Close membership editor"
                  >
                    {editingMembership && writes.controls}
                    <div {...stylex.props(s.membershipFields)}>
                      {(info.allowed.includes("members.write") ||
                        info.allowed.includes("members.promote")) && (
                        <p {...stylex.props(s.accessSecondary)}>
                          Elevated permissions require the separate promotion
                          action.
                        </p>
                      )}
                      {membershipMode === "add" &&
                        info.allowed.includes("users.list") && (
                          <DirectoryPicker
                            client={client}
                            value={subject}
                            change={setSubject}
                          />
                        )}
                      {selectedMember &&
                        !info.allowed.includes("members.write") &&
                        !info.allowed.includes("members.promote") && (
                          <Facts
                            entries={[
                              [
                                "Role",
                                read.data.roles.find(
                                  (role) => role.id === selectedMember.roleId
                                )?.label ?? selectedMember.roleId,
                              ],
                              [
                                "Status",
                                selectedMember.status === "active"
                                  ? "Active"
                                  : "Revoked",
                              ],
                            ]}
                          />
                        )}
                      {(info.allowed.includes("members.write") ||
                        info.allowed.includes("members.promote")) && (
                        <div {...stylex.props(s.membershipForm)}>
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
                          <div {...stylex.props(s.row)}>
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
                                        !readOnlyAdministrationActions.includes(
                                          action
                                        )
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
                                variant="secondary"
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
                        </div>
                      )}
                      {subject && info.allowed.includes("permissions.read") && (
                        <Permissions
                          key={subject}
                          client={client}
                          subjectId={subject}
                        />
                      )}
                      {membershipMode === "edit" &&
                        selectedMember &&
                        info.allowed.includes("members.write") && (
                          <div {...stylex.props(s.membershipRemoval)}>
                            <h3 {...stylex.props(s.accessLabel)}>
                              Remove Console access
                            </h3>
                            <Button
                              variant="danger-soft"
                              disabled={
                                writes.disabled ||
                                read.refreshing ||
                                selectedMember.status === "revoked"
                              }
                              onClick={() => {
                                const input = {
                                  subjectId: selectedMember.subjectId,
                                  expectedRevision: read.data!.revision,
                                };
                                writes.confirm(
                                  "Revoke Console membership?",
                                  `Remove ${selectedMember.subjectId}'s membership in ${info.consoleId}. This does not delete their identity.`,
                                  () => client.invoke("membersRevoke", input)
                                );
                              }}
                            >
                              Revoke membership
                            </Button>
                          </div>
                        )}
                    </div>
                  </AdministrationSurface>
                </>
              </ConsoleTableContext>
            ) : (
              <ConsoleTableContext
                scopeKey={workspace.activation?.key ?? workspace.mount.id}
                label="Roles"
                groups={[
                  {
                    id: "scope",
                    kind: "view",
                    label: "Access scope",
                    placement: "bottomLeft",
                    children: <AccessScope snapshot={read.data} />,
                  },
                  {
                    id: "query",
                    kind: "query",
                    label: "Search",
                    children: (
                      <ConsoleTableSearch
                        label="Search roles"
                        value={roleQuery}
                        onValueChange={setRoleQuery}
                      />
                    ),
                  },
                  ...(info.allowed.includes("roles.write") &&
                  info.allowed.includes("members.promote")
                    ? [
                        {
                          id: "create",
                          kind: "insertion" as const,
                          label: "Roles",
                          children: (
                            <ConsoleIconButton
                              label="Create role"
                              variant="primary"
                              disabled={
                                writes.disabled ||
                                creatingRole ||
                                roleEditor.open
                              }
                              onClick={(event) => {
                                roleOpener.current = event.currentTarget;
                                setCreatingRole(true);
                              }}
                            >
                              <Plus size={18} aria-hidden="true" />
                            </ConsoleIconButton>
                          ),
                        },
                      ]
                    : []),
                ]}
              >
                <div
                  ref={roleList}
                  tabIndex={-1}
                  {...stylex.props(s.accessList)}
                >
                  {visibleRoles.length ? (
                    <Records
                      label="Roles"
                      items={visibleRoles}
                      rowKey={(role) => role.id}
                      columns={[
                        {
                          id: "role",
                          label: "Role",
                          width: "1.5fr",
                          minWidth: 176,
                          render: (role) => (
                            <Button
                              variant="ghost"
                              xstyle={[s.subjectButton, s.memberButton]}
                              aria-label={`Inspect role ${role.label}`}
                              disabled={writes.pending}
                              onClick={(event) => {
                                roleOpener.current = event.currentTarget;
                                setRoleEditor({ id: role.id, open: true });
                              }}
                            >
                              <span {...stylex.props(s.memberIdentity)}>
                                {role.label}
                              </span>
                              <span {...stylex.props(s.accessSecondary)}>
                                {role.id}
                              </span>
                            </Button>
                          ),
                        },
                        {
                          id: "type",
                          label: "Type",
                          width: 112,
                          minWidth: 96,
                          render: (role) => (
                            <span {...stylex.props(s.accessSecondary)}>
                              {role.preset ? "Preset" : "Custom"}
                            </span>
                          ),
                        },
                        {
                          id: "permissions",
                          label: "Permissions",
                          width: "1fr",
                          minWidth: 168,
                          render: (role) => (
                            <span {...stylex.props(s.accessSecondary)}>
                              {role.permissions.length === 0
                                ? "No permissions"
                                : role.permissions.every((action) =>
                                      readOnlyAdministrationActions.includes(
                                        action
                                      )
                                    )
                                  ? "Read-only"
                                  : "Includes write access"}
                            </span>
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <p {...stylex.props(s.accessSecondary)}>
                      {read.data.roles.length
                        ? "No roles match this search."
                        : "No roles in this Console."}
                    </p>
                  )}
                </div>
                <RoleCreator
                  open={creatingRole}
                  client={client}
                  info={info}
                  revision={read.data.revision}
                  writes={writes}
                  roles={read.data.roles}
                  finalFocus={roleReturnFocus}
                  onClose={() => setCreatingRole(false)}
                />
                {selectedRole && (
                  <RoleEditor
                    key={`${read.data.revision}:${selectedRole.id}`}
                    client={client}
                    info={info}
                    role={selectedRole}
                    revision={read.data.revision}
                    writes={writes}
                    open={roleEditor.open}
                    initialFocus={roleEntry}
                    finalFocus={roleReturnFocus}
                    onClose={closeRole}
                  />
                )}
              </ConsoleTableContext>
            )}
          </>
        )}
      </ReadState>
    </div>
  );
}
function AdministrationSurface({
  presentation,
  open,
  busy,
  title,
  description,
  initialFocus,
  finalFocus,
  onClose,
  closeLabel,
  children,
}: {
  presentation: "modal" | "drawer";
  open: boolean;
  busy: boolean;
  title: string;
  description: string;
  initialFocus: RefObject<HTMLHeadingElement | null>;
  finalFocus(): HTMLElement | false;
  onClose(): void;
  closeLabel: string;
  children: ReactNode;
}) {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const Header = presentation === "modal" ? Modal.Header : Drawer.Header;
  const Title = presentation === "modal" ? Modal.Title : Drawer.Title;
  const SurfaceDescription =
    presentation === "modal" ? Modal.Description : Drawer.Description;
  const Body = presentation === "modal" ? Modal.Body : Drawer.Body;
  function handleOpenChange(next: boolean, details: { cancel(): void }) {
    if (busy) {
      details.cancel();
    } else if (!next) {
      onClose();
    }
  }
  const content = (
    <AdministrationPortalContext.Provider value={portal}>
      <Header xstyle={s.membershipHeader}>
        <div {...stylex.props(s.membershipHeading)}>
          <Title ref={initialFocus} tabIndex={-1} xstyle={s.subheading}>
            {title}
          </Title>
          <SurfaceDescription xstyle={s.accessSecondary}>
            {description}
          </SurfaceDescription>
        </div>
        <ConsoleIconButton
          label={closeLabel}
          variant="secondary"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </ConsoleIconButton>
      </Header>
      <Body xstyle={s.membershipOverlayBody}>{children}</Body>
    </AdministrationPortalContext.Provider>
  );
  return presentation === "modal" ? (
    <Modal.Root open={open} scroll="inside" onOpenChange={handleOpenChange}>
      <Modal.Portal>
        <Modal.Backdrop variant="opaque" />
        <Modal.Viewport xstyle={s.overlayViewport}>
          <Modal.Popup
            ref={setPortal}
            placement="center"
            size="md"
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            xstyle={s.membershipModal}
          >
            {content}
          </Modal.Popup>
        </Modal.Viewport>
      </Modal.Portal>
    </Modal.Root>
  ) : (
    <Drawer.Root
      open={open}
      swipeDirection="right"
      onOpenChange={handleOpenChange}
    >
      <Drawer.Portal>
        <Drawer.Backdrop variant="opaque" />
        <Drawer.Viewport>
          <Drawer.Popup
            ref={setPortal}
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            xstyle={s.membershipDrawer}
          >
            <Drawer.Content xstyle={s.membershipDrawerContent}>
              {content}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
function AccessScope({
  snapshot,
}: {
  snapshot: Pick<AccessSnapshot, "consoleId" | "tenantId" | "revision">;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<ConsoleIconButton label="Access scope" variant="secondary" />}
      >
        <Info size={18} aria-hidden="true" />
      </Popover.Trigger>
      <ThemeScope>
        <Popover.Portal>
          <Popover.Positioner side="top" align="start" sideOffset={8}>
            <Popover.Popup xstyle={s.accessScope}>
              <Popover.Title>Access scope</Popover.Title>
              <Facts
                entries={[
                  ["Console", snapshot.consoleId],
                  ["Tenant", snapshot.tenantId],
                  ["Revision", snapshot.revision],
                ]}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </ThemeScope>
    </Popover.Root>
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
    <section
      aria-label="Select existing identity"
      {...stylex.props(s.membershipForm)}
    >
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
            {read.data.nextCursor && (
              <Next cursor={read.data.nextCursor} next={setCursor} />
            )}
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
      <h3 {...stylex.props(s.accessLabel)}>Effective permissions</h3>
      <ReadState read={read}>
        {read.data && (
          <>
            <PermissionList actions={read.data.allowed} />
            <Accordion hideSeparator>
              <Accordion.Item value="sources">
                <Accordion.Heading>
                  <Accordion.Trigger xstyle={s.accessScopeTrigger}>
                    Permission sources
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body xstyle={s.accessScopeBody}>
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
                          render: (source) =>
                            source.permissions.join(", ") || "None",
                        },
                      ]}
                    />
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </>
        )}
      </ReadState>
    </section>
  );
}
function PermissionList({
  actions,
}: {
  actions: readonly AdministrationAction[];
}) {
  return actions.length ? (
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics when list-style is none.
    <ul role="list" {...stylex.props(s.permissionList)}>
      {actions.map((action) => (
        <li key={action}>
          <code>{action}</code>
        </li>
      ))}
    </ul>
  ) : (
    <p {...stylex.props(s.accessSecondary)}>No permissions.</p>
  );
}
function PermissionChoices({
  allowed,
  choices = allowed,
  selected,
  change,
  disabled,
  label = "Permissions",
  layout = "columns",
}: {
  allowed: readonly AdministrationAction[];
  choices?: readonly AdministrationAction[];
  selected: readonly AdministrationAction[];
  change: (actions: AdministrationAction[]) => void;
  disabled: boolean;
  label?: string;
  layout?: "columns" | "stack";
}) {
  const labelPrefix = useId();
  return (
    <fieldset
      disabled={disabled}
      {...stylex.props(s.permissions, layout === "stack" && s.permissionStack)}
    >
      <legend {...stylex.props(layout === "stack" && s.permissionGroupLabel)}>
        {label}
      </legend>
      {choices
        .filter((action) => allowed.includes(action))
        .map((action) => (
          <div key={action} {...stylex.props(s.choice)}>
            <Checkbox
              aria-labelledby={`${labelPrefix}-${action}`}
              xstyle={s.choice}
              disabled={disabled}
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
const permissionGroupLabels: Record<string, string> = {
  users: "Directory",
  sessions: "Sessions",
  members: "Membership",
  roles: "Roles",
  permissions: "Permission inspection",
  tokens: "Personal tokens",
  audit: "Audit events",
};
function groupPermissions(actions: readonly AdministrationAction[]) {
  const groups = new Map<string, AdministrationAction[]>();
  for (const action of actions) {
    const id = action.split(".")[0]!;
    const group = groups.get(id) ?? [];
    group.push(action);
    groups.set(id, group);
  }
  return [...groups].map(([id, values]) => ({
    id,
    label: permissionGroupLabels[id] ?? id,
    actions: values,
  }));
}
function RolePermissionChoices(
  props: Pick<
    ComponentProps<typeof PermissionChoices>,
    "allowed" | "selected" | "change" | "disabled"
  >
) {
  return (
    <section
      aria-label="Role permissions"
      {...stylex.props(s.rolePermissionGroups)}
    >
      {groupPermissions(props.allowed).map((group) => (
        <PermissionChoices
          key={group.id}
          {...props}
          choices={group.actions}
          label={group.label}
          layout="stack"
        />
      ))}
    </section>
  );
}
type RoleCreationProps = AdministrationPageProps & {
  info: AdministrationInfo;
  revision: string;
  roles: readonly ConsoleRole[];
  writes: Writes;
  open: boolean;
  finalFocus(): HTMLElement | false;
  onClose(): void;
};
function RoleCreator({
  client,
  info,
  revision,
  roles,
  writes,
  open,
  onClose,
  finalFocus,
}: RoleCreationProps) {
  const nameInput = useRef<HTMLInputElement>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formId = useId();
  const templates = roles.filter((role) => role.preset);
  const initialTemplate = templates.find(
    (role) =>
      role.permissions.length > 0 &&
      role.permissions.every((action) =>
        readOnlyAdministrationActions.includes(action)
      )
  );
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [template, setTemplate] = useState(initialTemplate?.id ?? "");
  const [permissions, setPermissions] = useState<
    readonly AdministrationAction[]
  >(
    (initialTemplate?.permissions ?? readOnlyAdministrationActions).filter(
      (action) => info.allowed.includes(action)
    )
  );
  const created = useRef(false);
  const duplicate =
    !created.current && roles.some((role) => role.id === id.trim());
  useEffect(() => {
    if (created.current && open && !writes.disabled && !writes.confirming) {
      onClose();
      created.current = false;
      setId("");
      setLabel("");
      setTemplate(initialTemplate?.id ?? "");
      setPermissions(
        (initialTemplate?.permissions ?? readOnlyAdministrationActions).filter(
          (action) => info.allowed.includes(action)
        )
      );
      setErrors({});
    }
  }, [
    open,
    writes.disabled,
    writes.confirming,
    onClose,
    initialTemplate,
    info.allowed,
  ]);
  return (
    <Modal.Root
      open={open}
      scroll="inside"
      onOpenChange={(next, details) => {
        if (writes.pending || writes.confirming) {
          details.cancel();
        } else if (!next) {
          onClose();
        }
      }}
    >
      <Modal.Portal>
        <Modal.Backdrop variant="opaque" />
        <Modal.Viewport xstyle={s.overlayViewport}>
          <Modal.Popup
            ref={setPortal}
            size="lg"
            placement="center"
            initialFocus={nameInput}
            finalFocus={finalFocus}
            xstyle={s.roleCreationDialog}
          >
            <AdministrationPortalContext.Provider value={portal}>
              <Modal.Header xstyle={s.membershipHeader}>
                <div {...stylex.props(s.membershipHeading)}>
                  <Modal.Title>Create role</Modal.Title>
                  <Modal.Description>
                    Define a permission set. Creating a role does not assign
                    members.
                  </Modal.Description>
                </div>
                <ConsoleIconButton
                  label="Close role creation"
                  variant="secondary"
                  disabled={writes.pending || writes.confirming}
                  onClick={onClose}
                >
                  <X size={18} aria-hidden="true" />
                </ConsoleIconButton>
              </Modal.Header>
              <Modal.Body xstyle={s.membershipOverlayBody}>
                {open && writes.controls}
                <Form
                  id={formId}
                  aria-label="Create custom role"
                  errors={
                    duplicate
                      ? { ...errors, id: "A role with this ID already exists." }
                      : errors
                  }
                  xstyle={s.roleForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (
                      writes.disabled ||
                      writes.confirming ||
                      created.current ||
                      duplicate ||
                      !id.trim() ||
                      !label.trim()
                    ) {
                      return;
                    }
                    setErrors({});
                    const input = {
                      id: id.trim(),
                      label: label.trim(),
                      permissions: [...permissions],
                      expectedRevision: revision,
                    };
                    writes.confirm(
                      "Create custom role?",
                      `Create ${input.label} (${input.id}) in ${info.consoleId}.`,
                      async () => {
                        await client.invoke("rolesSave", input);
                        created.current = true;
                      },
                      (paths) =>
                        setErrors(
                          Object.fromEntries(
                            paths
                              .filter(
                                (path) =>
                                  path.length === 1 &&
                                  ["id", "label", "permissions"].includes(
                                    path[0]!
                                  )
                              )
                              .map(([field]) => [field!, "Check this value."])
                          )
                        )
                    );
                  }}
                >
                  <div {...stylex.props(s.roleIdentityFields)}>
                    <TextField name="label">
                      <Label htmlFor={`${formId}-name`}>Role name</Label>
                      <Input
                        id={`${formId}-name`}
                        ref={nameInput}
                        required
                        value={label}
                        onChange={(event) => {
                          setLabel(event.target.value);
                          setErrors((current) => ({ ...current, label: "" }));
                        }}
                        disabled={writes.disabled}
                        maxLength={512}
                        xstyle={s.control}
                      />
                      <FieldError />
                    </TextField>
                    <TextField name="id">
                      <Label htmlFor={`${formId}-id`}>Role ID</Label>
                      <Input
                        id={`${formId}-id`}
                        required
                        value={id}
                        onChange={(event) => {
                          setId(event.target.value);
                          setErrors((current) => ({ ...current, id: "" }));
                        }}
                        disabled={writes.disabled}
                        maxLength={512}
                        xstyle={s.control}
                      />
                      <Description>Unique within this Console.</Description>
                      <FieldError />
                    </TextField>
                  </div>
                  <div {...stylex.props(s.membershipForm)}>
                    <Choice
                      label="Role template"
                      value={template}
                      placeholder="Custom permissions"
                      options={templates.map((role) => ({
                        value: role.id,
                        label: role.label,
                      }))}
                      disabled={writes.disabled}
                      change={(templateId) => {
                        setTemplate(templateId);
                        setErrors((current) => ({
                          ...current,
                          permissions: "",
                        }));
                        setPermissions(
                          templates
                            .find((role) => role.id === templateId)
                            ?.permissions.filter((action) =>
                              info.allowed.includes(action)
                            ) ?? []
                        );
                      }}
                    />
                    <p {...stylex.props(s.accessSecondary)}>
                      A template copies permissions into this draft. You can
                      change them below.
                    </p>
                  </div>
                  {errors.permissions && (
                    <p role="alert">Permissions: {errors.permissions}</p>
                  )}
                  <RolePermissionChoices
                    allowed={info.allowed}
                    selected={permissions}
                    disabled={writes.disabled}
                    change={(next) => {
                      setPermissions(next);
                      setTemplate("");
                      setErrors((current) => ({ ...current, permissions: "" }));
                    }}
                  />
                </Form>
              </Modal.Body>
              <Modal.Footer xstyle={s.roleCreationFooter}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={writes.pending || writes.confirming}
                  onClick={onClose}
                >
                  Cancel creation
                </Button>
                <Button
                  type="submit"
                  form={formId}
                  variant="primary"
                  disabled={
                    writes.disabled ||
                    writes.confirming ||
                    created.current ||
                    duplicate ||
                    !id.trim() ||
                    !label.trim()
                  }
                >
                  Create custom role
                </Button>
              </Modal.Footer>
            </AdministrationPortalContext.Provider>
          </Modal.Popup>
        </Modal.Viewport>
      </Modal.Portal>
    </Modal.Root>
  );
}

function RoleEditor({
  client,
  info,
  role,
  revision,
  writes,
  open,
  initialFocus,
  finalFocus,
  onClose,
}: AdministrationPageProps & {
  open: boolean;
  initialFocus: RefObject<HTMLHeadingElement | null>;
  finalFocus(): HTMLElement | false;
  onClose(): void;
  info: AdministrationInfo;
  role: ConsoleRole;
  revision: string;
  writes: Writes;
}) {
  const [permissions, setPermissions] = useState<
    readonly AdministrationAction[]
  >(role.permissions);
  const dirty =
    permissions.length !== role.permissions.length ||
    permissions.some((permission) => !role.permissions.includes(permission));
  const editable =
    info.allowed.includes("roles.write") &&
    info.allowed.includes("members.promote") &&
    !role.preset &&
    role.permissions.every((action) => info.allowed.includes(action));
  return (
    <AdministrationSurface
      presentation="drawer"
      open={open}
      busy={writes.pending || writes.confirming}
      title={role.label}
      description={role.id}
      initialFocus={initialFocus}
      finalFocus={finalFocus}
      onClose={onClose}
      closeLabel="Close role"
    >
      {open && writes.controls}
      <section aria-label={`Role ${role.label}`} {...stylex.props(s.roleForm)}>
        <p {...stylex.props(s.accessSecondary)}>
          {role.preset
            ? "Preset role. Permissions are read-only."
            : "Permission changes affect every member assigned to this role."}
        </p>
        {editable ? (
          <>
            <RolePermissionChoices
              allowed={info.allowed}
              selected={permissions}
              change={setPermissions}
              disabled={writes.disabled}
            />
            {dirty && <output>Unsaved permission changes.</output>}
            <div {...stylex.props(s.row)}>
              <Button
                type="button"
                variant="secondary"
                disabled={writes.disabled || !dirty}
                onClick={() => setPermissions(role.permissions)}
              >
                Discard changes
              </Button>
              <Button
                variant="primary"
                disabled={writes.disabled || !dirty}
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
            </div>
          </>
        ) : role.permissions.length ? (
          <div {...stylex.props(s.rolePermissionGroups)}>
            {groupPermissions(role.permissions).map((group) => (
              <section key={group.id}>
                <h3 {...stylex.props(s.permissionGroupLabel)}>{group.label}</h3>
                <PermissionList actions={group.actions} />
              </section>
            ))}
          </div>
        ) : (
          <PermissionList actions={[]} />
        )}
        {!role.preset && !editable && (
          <p {...stylex.props(s.accessSecondary)}>
            Editing requires roles.write, members.promote and authority for
            every permission in this role.
          </p>
        )}
      </section>
    </AdministrationSurface>
  );
}

export function AgentPage({
  client,
  tabs = "workspace",
}: AdministrationPageProps) {
  return (
    <Frame client={client} label="Agent">
      {(info) => <Agent client={client} info={info} tabs={tabs} />}
    </Frame>
  );
}
function Agent({
  client,
  info,
  tabs = "workspace",
}: AdministrationPageProps & { info: AdministrationInfo }) {
  const workspace = useWorkspace();
  const tab =
    workspace.location.segments[0] === "events" &&
    info.allowed.includes("audit.list")
      ? "audit"
      : "tokens";
  return (
    <div {...stylex.props(s.section)}>
      {tabs === "workspace" && (
        <AdministrationTabs
          label="Agent connections"
          tabs={[
            { id: "tokens", label: "Tokens", segments: [] },
            ...(info.allowed.includes("audit.list")
              ? [{ id: "events", label: "Events", segments: ["events"] }]
              : []),
          ]}
        />
      )}
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
  const workspace = useWorkspace();
  const [cursor, setCursor] = useState<string>();
  const read = useRead(client, "tokensList", {
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  const [deliveryReady, setDeliveryReady] = useState(false);
  // Wait for the confirmation's focus trap to retire before opening credential delivery.
  const writes = useWrites(
    read.refetch,
    () => setCursor(undefined),
    () => setDeliveryReady(true)
  );
  const [scopes, setScopes] = useState<readonly AdministrationAction[]>(
    defaultTokenScopes.filter((scope) => info.allowed.includes(scope))
  );
  const [expiry, setExpiry] = useState(() => localDateTimeAfter(7));
  const [delivery, setDelivery] = useState<CredentialDelivery | null>(null);
  const lifetime = useRef({ value: 0 });
  const expiryId = useId();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entry = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = read.data?.items.find((token) => token.id === selectedId);
  const returnFocus = () =>
    opener.current?.isConnected ? opener.current : (list.current ?? false);
  useEffect(() => {
    const generation = lifetime.current;
    generation.value += 1;
    return () => {
      generation.value += 1;
    };
  }, []);
  async function deliver(work: () => Promise<CredentialDelivery>) {
    const generation = lifetime.current.value;
    setDeliveryReady(false);
    setDelivery(null);
    const result = await work();
    if (lifetime.current.value === generation) {
      setDelivery(result);
    }
  }
  const expiresAt = new Date(expiry).getTime();
  const credentialDialog = (
    <TokenCredentialDialog
      delivery={delivery}
      pending={writes.pending || !deliveryReady}
      onDismiss={() => {
        setDelivery(null);
        setCreating(false);
      }}
    />
  );
  return (
    <section aria-label="Own personal tokens" {...stylex.props(s.section)}>
      {!creating && !selected && writes.controls}
      {!creating && !selected && credentialDialog}
      <ConsoleTableContext
        scopeKey={workspace.activation?.key ?? workspace.mount.id}
        label="Personal tokens"
        groups={[
          {
            id: "connection",
            kind: "view",
            label: "Connection information",
            placement: "bottomLeft",
            children: <AgentInformation info={info} />,
          },
          ...(info.allowed.includes("tokens.issue")
            ? [
                {
                  id: "create",
                  kind: "insertion" as const,
                  label: "Personal tokens",
                  children: (
                    <ConsoleIconButton
                      label="Create personal token"
                      variant="primary"
                      disabled={
                        writes.disabled || creating || !!selected || !!delivery
                      }
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                        setScopes(
                          defaultTokenScopes.filter((scope) =>
                            info.allowed.includes(scope)
                          )
                        );
                        setExpiry(localDateTimeAfter(7));
                        setCreating(true);
                      }}
                    >
                      <Plus size={18} aria-hidden="true" />
                    </ConsoleIconButton>
                  ),
                },
              ]
            : []),
          ...(read.data?.nextCursor
            ? [
                {
                  id: "navigation",
                  kind: "navigation" as const,
                  label: "Pagination",
                  children: (
                    <Next cursor={read.data.nextCursor} next={setCursor} />
                  ),
                },
              ]
            : []),
        ]}
      >
        <div ref={list} tabIndex={-1} {...stylex.props(s.accessList)}>
          <ReadState read={read}>
            {read.data && (
              <Records
                label="Personal tokens"
                items={read.data.items}
                rowKey={(token) => token.id}
                columns={[
                  {
                    id: "id",
                    label: "Token",
                    width: "1.5fr",
                    minWidth: 200,
                    render: (token) => (
                      <Button
                        variant="ghost"
                        xstyle={[s.subjectButton, s.memberButton]}
                        aria-label={`Inspect token ${token.id}`}
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          setSelectedId(token.id);
                        }}
                      >
                        <span {...stylex.props(s.memberIdentity)}>
                          {token.id}
                        </span>
                      </Button>
                    ),
                  },
                  {
                    id: "state",
                    label: "Status",
                    width: 112,
                    minWidth: 96,
                    render: tokenStatus,
                  },
                  {
                    id: "expires",
                    label: "Expires",
                    minWidth: 176,
                    render: (token) => date(token.expiresAt),
                  },
                ]}
              />
            )}
          </ReadState>
        </div>
      </ConsoleTableContext>
      {info.allowed.includes("tokens.issue") && (
        <AdministrationSurface
          presentation="modal"
          open={creating}
          busy={writes.pending || writes.confirming || !!delivery}
          title="Create personal token"
          description="Choose the minimum permissions your MCP client needs. The credential is shown only once."
          initialFocus={entry}
          finalFocus={returnFocus}
          closeLabel="Close token creation"
          onClose={() => setCreating(false)}
        >
          {creating && writes.controls}
          {creating && credentialDialog}
          <section
            aria-label="Create personal token"
            {...stylex.props(s.editor)}
          >
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
              layout="stack"
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
                !!delivery ||
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
        </AdministrationSurface>
      )}
      {selected && (
        <AdministrationSurface
          presentation="drawer"
          open={true}
          busy={writes.pending || writes.confirming || !!delivery}
          title="Personal token"
          description={selected.id}
          initialFocus={entry}
          finalFocus={returnFocus}
          closeLabel="Close token"
          onClose={() => setSelectedId(null)}
        >
          {writes.controls}
          {credentialDialog}
          <div {...stylex.props(s.roleForm)}>
            <TokenDetails token={selected} />
            <TokenActions
              token={selected}
              info={info}
              writes={writes}
              refreshing={read.refreshing || !!delivery}
              client={client}
              deliver={deliver}
            />
          </div>
        </AdministrationSurface>
      )}
    </section>
  );
}
function tokenStatus(token: PersonalToken) {
  return token.revokedAt
    ? "Revoked"
    : token.expiresAt <= Date.now()
      ? "Expired"
      : "Active";
}
function TokenDetails({ token }: { token: PersonalToken }) {
  return (
    <div {...stylex.props(s.membershipFields)}>
      <Facts
        entries={[
          ["Status", tokenStatus(token)],
          ["Issued", date(token.issuedAt)],
          ["Expires", date(token.expiresAt)],
          ...(token.revokedAt === null
            ? []
            : [["Revoked", date(token.revokedAt)] as const]),
          ...(token.overlapUntil === null
            ? []
            : [["Rotation overlap until", date(token.overlapUntil)] as const]),
        ]}
      />
      <section aria-label="Token permissions">
        <h3 {...stylex.props(s.accessLabel)}>Permissions</h3>
        <PermissionList actions={token.scopes} />
      </section>
    </div>
  );
}
function TokenActions({
  token,
  info,
  writes,
  refreshing,
  client,
  deliver,
}: {
  token: PersonalToken;
  info: AdministrationInfo;
  writes: Writes;
  refreshing: boolean;
  client: AdministrationClient;
  deliver(work: () => Promise<CredentialDelivery>): Promise<void>;
}) {
  return (
    <div {...stylex.props(s.row)}>
      {info.allowed.includes("tokens.rotate") && (
        <Button
          variant="secondary"
          disabled={
            writes.disabled ||
            refreshing ||
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
          disabled={writes.disabled || refreshing || !!token.revokedAt}
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
  );
}
function Audit({ client }: AdministrationPageProps) {
  const workspace = useWorkspace();
  const [cursor, setCursor] = useState<string>();
  const read = useRead(client, "auditList", {
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  const [selected, setSelected] = useState<ManagementEvent | null>(null);
  const entry = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  return (
    <section
      aria-label="Observed management events"
      {...stylex.props(s.section)}
    >
      <ConsoleTableContext
        scopeKey={workspace.activation?.key ?? workspace.mount.id}
        label="Observed events"
        groups={[
          {
            id: "information",
            kind: "view",
            label: "Event information",
            placement: "bottomLeft",
            children: <AgentInformation />,
          },
          ...(read.data?.nextCursor
            ? [
                {
                  id: "navigation",
                  kind: "navigation" as const,
                  label: "Pagination",
                  children: (
                    <Next cursor={read.data.nextCursor} next={setCursor} />
                  ),
                },
              ]
            : []),
        ]}
      >
        <div ref={list} tabIndex={-1} {...stylex.props(s.accessList)}>
          <ReadState read={read}>
            {read.data && (
              <>
                <Records
                  label="Observed events"
                  items={read.data.items}
                  rowKey={(event) => event.id}
                  columns={[
                    {
                      id: "action",
                      label: "Action",
                      width: "1.5fr",
                      minWidth: 200,
                      render: (event) => (
                        <Button
                          variant="ghost"
                          xstyle={[s.subjectButton, s.memberButton]}
                          aria-label={`Inspect event ${event.id}`}
                          onClick={(click) => {
                            opener.current = click.currentTarget;
                            setSelected(event);
                          }}
                        >
                          <span {...stylex.props(s.memberIdentity)}>
                            {event.action}
                          </span>
                          {event.targetId && (
                            <span {...stylex.props(s.accessSecondary)}>
                              {event.targetId}
                            </span>
                          )}
                        </Button>
                      ),
                    },
                    {
                      id: "subject",
                      label: "Subject",
                      render: (event) => event.subjectId,
                    },
                    {
                      id: "time",
                      label: "Observed at",
                      minWidth: 176,
                      render: (event) => date(event.occurredAt),
                    },
                    {
                      id: "result",
                      label: "Result",
                      render: (event) => event.result,
                    },
                  ]}
                />
              </>
            )}
          </ReadState>
        </div>
      </ConsoleTableContext>
      {selected && (
        <AdministrationSurface
          presentation="drawer"
          open={true}
          busy={false}
          title={selected.action}
          description="Recorded management activity, not live connection status."
          initialFocus={entry}
          finalFocus={() =>
            opener.current?.isConnected
              ? opener.current
              : (list.current ?? false)
          }
          onClose={() => setSelected(null)}
          closeLabel="Close event"
        >
          <Facts
            entries={[
              ["Event ID", selected.id],
              ["Observed at", date(selected.occurredAt)],
              ["Subject", selected.subjectId],
              ["Target", selected.targetId ?? "No target"],
              ["Result", selected.result],
            ]}
          />
        </AdministrationSurface>
      )}
    </section>
  );
}
function AgentInformation({ info }: { info?: AdministrationInfo }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <ConsoleIconButton
            label={info ? "Connection information" : "Event information"}
            variant="secondary"
          />
        }
      >
        <Info size={18} aria-hidden="true" />
      </Popover.Trigger>
      <ThemeScope>
        <Popover.Portal>
          <Popover.Positioner side="top" align="start" sideOffset={8}>
            <Popover.Popup xstyle={s.accessScope}>
              <Popover.Title>
                {info ? "Connect an MCP client" : "Management events"}
              </Popover.Title>
              {info ? (
                <>
                  <Facts
                    entries={[
                      ["MCP URL", info.mcpUrl],
                      ["Authentication", "Personal access token"],
                      ["Last observed call", date(info.observedLastCallAt)],
                    ]}
                  />
                  <p {...stylex.props(s.accessSecondary)}>
                    Store your token as <code>LENSO_MCP_TOKEN</code> in the
                    client environment and use custom Bearer authentication, not
                    OAuth. Do not put the credential in a URL or commit it to
                    configuration.
                  </p>
                  <p {...stylex.props(s.accessSecondary)}>
                    Tokens belong to your identity. An observed call is
                    historical activity, not proof that an agent is currently
                    connected.
                  </p>
                </>
              ) : (
                <p {...stylex.props(s.accessSecondary)}>
                  These records show management activity, not live agent
                  connections. Open an action to inspect its full record.
                </p>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </ThemeScope>
    </Popover.Root>
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
    return (
      <AccessPage client={props.client} tabs={props.tabs ?? "workspace"} />
    );
  }
  return <AgentPage client={props.client} tabs={props.tabs ?? "workspace"} />;
}
