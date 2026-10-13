import {
  ConsoleActionScope,
  ConsoleIconButton,
  ConsoleLayout,
  ConsolePageScope,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";
import { AlertDialog } from "@lenso/ui/alert-dialog";
import { Button } from "@lenso/ui/button";
import { DangerIcon } from "@lenso/ui/icons";
import { Link } from "@lenso/ui/link";
import { Pagination } from "@lenso/ui/pagination";
import { Separator } from "@lenso/ui/separator";
import { Table } from "@lenso/ui/table";
import { Typography } from "@lenso/ui/typography";
import * as stylex from "@stylexjs/stylex";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  AuthConsoleClient,
  SessionDTO,
  SessionPageDTO,
} from "./contracts";
import { styles } from "./pages.styles";

type Props = ConsoleLocalPageProps<AuthConsoleClient>;
type Result<T> =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; value: T };

function Timestamp({ value }: { value: number }) {
  const iso = new Date(value).toISOString();
  return (
    <time dateTime={iso}>{iso.replace("T", " ").replace("Z", " UTC")}</time>
  );
}

function Load<T>({
  load,
  children,
  ...props
}: Props & {
  load: (signal: AbortSignal) => Promise<T>;
  children: (value: T) => ReactNode;
}) {
  const [result, setResult] = useState<Result<T>>({ state: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, props.signal]);
    setResult({ state: "loading" });
    void (async () => {
      try {
        const value = await load(signal);
        if (!signal.aborted && props.activation.isCurrent()) {
          setResult({ state: "ready", value });
        }
      } catch {
        if (!signal.aborted && props.activation.isCurrent()) {
          setResult({ state: "error" });
        }
      }
    })();
    return () => controller.abort();
  }, [load, props.signal, props.activation]);
  if (result.state === "loading") {
    return <output {...stylex.props(styles.message)}>Loading…</output>;
  }
  if (result.state === "error") {
    return (
      <p role="alert" {...stylex.props(styles.message, styles.error)}>
        Unable to load this Auth view.
      </p>
    );
  }
  return children(result.value);
}

export function InfoPage(props: Props & { embedded?: boolean }) {
  return <Info key={props.activation.key} {...props} />;
}

function Info(props: Props & { embedded?: boolean }) {
  const load = useCallback(
    (signal: AbortSignal) => props.services.info!({ signal }),
    [props.services]
  );
  return (
    <section
      aria-label="Auth information"
      {...stylex.props(
        !props.embedded && styles.page,
        !props.embedded && styles.infoPage
      )}
    >
      {!props.embedded && (
        <ConsolePageScope
          scopeKey={props.activation.key}
          value={{ context: { kind: "object", label: "Auth information" } }}
        />
      )}
      <Load {...props} load={load}>
        {(info) =>
          props.embedded ? (
            <>
              <header {...stylex.props(styles.infoWidgetIdentity)}>
                <Typography.Heading level={2} xstyle={styles.infoWidgetRealm}>
                  {info.realm}
                </Typography.Heading>
              </header>
              <dl {...stylex.props(styles.infoWidgetMetadata)}>
                <div {...stylex.props(styles.infoWidgetField)}>
                  <dt {...stylex.props(styles.label)}>Source</dt>
                  <dd {...stylex.props(styles.infoValue)}>{info.source}</dd>
                </div>
                <div {...stylex.props(styles.infoWidgetField)}>
                  <dt {...stylex.props(styles.label)}>Policy</dt>
                  <dd {...stylex.props(styles.infoValue)}>{info.policy}</dd>
                </div>
              </dl>
            </>
          ) : (
            <dl {...stylex.props(styles.infoMetadata)}>
              <div {...stylex.props(styles.infoField)}>
                <dt {...stylex.props(styles.label)}>Realm</dt>
                <dd {...stylex.props(styles.infoValue)}>{info.realm}</dd>
              </div>
              <div {...stylex.props(styles.infoField)}>
                <dt {...stylex.props(styles.label)}>Source</dt>
                <dd {...stylex.props(styles.infoValue)}>{info.source}</dd>
              </div>
              <div {...stylex.props(styles.infoField)}>
                <dt {...stylex.props(styles.label)}>Policy</dt>
                <dd {...stylex.props(styles.infoValue)}>{info.policy}</dd>
              </div>
            </dl>
          )
        }
      </Load>
    </section>
  );
}

export function SessionsPage(props: Props) {
  return <Sessions key={props.activation.key} {...props} />;
}

function Sessions(props: Props) {
  const [result, setResult] = useState<Result<SessionPageDTO>>({
    state: "loading",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const canInspect =
    props.services.capabilities.sessionDetail && !!props.services.readSession;
  const request = useRef<AbortController | null>(null);
  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (props.signal.aborted || !props.activation.isCurrent()) {
        return;
      }
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const signal = AbortSignal.any([controller.signal, props.signal]);
      setBusy(true);
      setError(false);
      if (cursor === undefined) {
        setSelectedIds(new Set());
        setResult({ state: "loading" });
      }
      try {
        const page = props.services.listSessionPage
          ? await props.services.listSessionPage(
              cursor === undefined ? {} : { cursor },
              { signal }
            )
          : {
              sessions: await props.services.listSessions!({ signal }),
              nextCursor: null,
            };
        if (!signal.aborted && props.activation.isCurrent()) {
          setResult((previous) => ({
            state: "ready",
            value: {
              sessions:
                cursor !== undefined && previous.state === "ready"
                  ? [...previous.value.sessions, ...page.sessions]
                  : page.sessions,
              nextCursor: page.nextCursor,
            },
          }));
        }
      } catch {
        if (!signal.aborted && props.activation.isCurrent()) {
          setError(true);
          if (cursor === undefined) {
            setResult({ state: "error" });
          }
        }
      } finally {
        if (!signal.aborted && props.activation.isCurrent()) {
          setBusy(false);
        }
      }
    },
    [props.services, props.signal, props.activation]
  );
  useEffect(() => {
    void fetchPage();
    return () => request.current?.abort();
  }, [fetchPage]);
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  function inspectSelected() {
    if (
      canInspect &&
      selectedId &&
      result.state === "ready" &&
      result.value.sessions.some((session) => session.id === selectedId) &&
      !props.signal.aborted &&
      props.activation.isCurrent()
    ) {
      props.navigation.go("session", { id: selectedId });
    }
  }
  return (
    <>
      <ConsolePageScope
        scopeKey={props.activation.key}
        value={{
          context: {
            kind: "object",
            label: "Sessions",
          },
        }}
      />
      <ConsoleActionScope
        scopeKey={props.activation.key}
        value={
          canInspect && selectedIds.size > 0
            ? {
                count: selectedIds.size,
                scopeLabel: "Sessions in this list",
                running: false,
                actions: selectedId
                  ? [
                      {
                        id: "inspect",
                        label: "Inspect session",
                        icon: <span aria-hidden="true">↗</span>,
                        onInvoke: inspectSelected,
                      },
                    ]
                  : [],
                onExit: () => setSelectedIds(new Set()),
              }
            : null
        }
      />
      <section aria-label="Sessions" {...stylex.props(styles.page)}>
        {busy && (
          <output {...stylex.props(styles.message)}>Loading sessions…</output>
        )}
        {error && (
          <p role="alert" {...stylex.props(styles.message, styles.error)}>
            Unable to load sessions. Reload this page to try again.
          </p>
        )}
        {result.state === "ready" && (
          <Table.Root variant="secondary">
            {result.value.sessions.length === 0 ? (
              <p {...stylex.props(styles.message)}>No sessions found.</p>
            ) : (
              <Table.ScrollContainer>
                <Table.Content
                  aria-label="Sessions"
                  selectionMode={canInspect ? "multiple" : "none"}
                  selectedKeys={selectedIds}
                  onSelectionChange={(keys) => {
                    if (
                      canInspect &&
                      props.activation.isCurrent() &&
                      !props.signal.aborted
                    ) {
                      setSelectedIds(new Set([...keys].map(String)));
                    }
                  }}
                  xstyle={styles.sessionTable}
                >
                  <Table.Header>
                    {canInspect && (
                      <Table.Column
                        columnKey="selection"
                        width={60}
                        minWidth={60}
                        maxWidth={60}
                        xstyle={styles.selectionCell}
                      >
                        <label
                          htmlFor={`${props.activation.key}-select-all-sessions`}
                          {...stylex.props(styles.selectionControl)}
                        >
                          <Table.SelectionCheckbox
                            id={`${props.activation.key}-select-all-sessions`}
                            aria-label="Select all sessions"
                            xstyle={styles.selectionCheckbox}
                          />
                        </label>
                      </Table.Column>
                    )}
                    <Table.Column columnKey="id" width="1.3fr" minWidth={140}>
                      Session ID
                    </Table.Column>
                    <Table.Column
                      columnKey="subject"
                      width="1fr"
                      minWidth={120}
                    >
                      Subject ID
                    </Table.Column>
                    <Table.Column
                      columnKey="expiry"
                      width="1.1fr"
                      minWidth={160}
                    >
                      Stored expiry (UTC)
                    </Table.Column>
                    <Table.Column columnKey="status" width={136} minWidth={136}>
                      Status
                    </Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {result.value.sessions.map((session) => (
                      <Table.Row
                        key={session.id}
                        itemKey={session.id}
                        textValue={session.id}
                      >
                        {canInspect && (
                          <Table.Cell
                            columnKey="selection"
                            xstyle={styles.selectionCell}
                          >
                            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The native label owns the checkbox hit target, not the selectable row. */}
                            <label
                              htmlFor={`${props.activation.key}-select-session-${encodeURIComponent(session.id)}`}
                              {...stylex.props(styles.selectionControl)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (
                                  event.key === " " ||
                                  event.key === "Enter"
                                ) {
                                  event.stopPropagation();
                                }
                              }}
                            >
                              <Table.SelectionCheckbox
                                id={`${props.activation.key}-select-session-${encodeURIComponent(session.id)}`}
                                aria-label={`Select session ${session.id}`}
                                xstyle={styles.selectionCheckbox}
                              />
                            </label>
                          </Table.Cell>
                        )}
                        <Table.Cell columnKey="id" xstyle={styles.tableCell}>
                          {canInspect ? (
                            <Link
                              href={props.navigation.href("session", {
                                id: session.id,
                              })}
                              xstyle={styles.sessionLink}
                            >
                              {session.id}
                            </Link>
                          ) : (
                            <span {...stylex.props(styles.identifier)}>
                              {session.id}
                            </span>
                          )}
                        </Table.Cell>
                        <Table.Cell
                          columnKey="subject"
                          xstyle={styles.tableCell}
                        >
                          {session.subjectId}
                        </Table.Cell>
                        <Table.Cell
                          columnKey="expiry"
                          xstyle={styles.tableCell}
                        >
                          <Timestamp value={session.expiresAt} />
                        </Table.Cell>
                        <Table.Cell
                          columnKey="status"
                          xstyle={[
                            styles.status,
                            session.revokedAt !== undefined && styles.revoked,
                          ]}
                        >
                          {session.revokedAt === undefined
                            ? "Not revoked"
                            : "Revoked"}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            )}
            {props.services.listSessionPage && (
              <Table.Footer>
                <Pagination aria-label="Session list navigation">
                  <Pagination.Summary>
                    {result.value.sessions.length} sessions loaded
                  </Pagination.Summary>
                  <Pagination.Content>
                    <Pagination.Item>
                      <Pagination.Next
                        render={
                          <button
                            aria-label="Load more sessions"
                            type="button"
                            disabled={busy || result.value.nextCursor === null}
                          />
                        }
                        xstyle={styles.button}
                        disabled={busy || result.value.nextCursor === null}
                        onClick={() => {
                          if (!busy && result.value.nextCursor !== null) {
                            void fetchPage(result.value.nextCursor);
                          }
                        }}
                      >
                        Load more sessions
                        <Pagination.NextIcon />
                      </Pagination.Next>
                    </Pagination.Item>
                  </Pagination.Content>
                </Pagination>
              </Table.Footer>
            )}
          </Table.Root>
        )}
      </section>
    </>
  );
}

export function SessionPage(props: Props & { canReturnToSessions: boolean }) {
  return (
    <Session key={`${props.activation.key}:${props.params.id}`} {...props} />
  );
}

function Session(props: Props & { canReturnToSessions: boolean }) {
  const { id } = props.params;
  const load = useCallback(
    (signal: AbortSignal) => {
      if (!id) {
        return Promise.reject(new Error("Missing session ID"));
      }
      return props.services.readSession!(id, { signal });
    },
    [id, props.services]
  );
  const [confirmation, setConfirmation] = useState(false);
  const [target, setTarget] = useState<Pick<
    SessionDTO,
    "id" | "subjectId" | "revision"
  > | null>(null);
  const [outcome, setOutcome] = useState<
    "idle" | "running" | "revoked" | "unchanged" | "error"
  >("idle");
  const running = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLOutputElement>(null);
  const errorFeedback = useRef<HTMLParagraphElement>(null);
  async function revoke() {
    if (
      !id ||
      !target ||
      target.id !== id ||
      !props.activation.isCurrent() ||
      props.signal.aborted ||
      running.current ||
      !confirmation ||
      outcome === "error" ||
      outcome === "revoked" ||
      !props.services.capabilities.sessionRevoke ||
      !props.services.revokeSession
    ) {
      return;
    }
    running.current = true;
    setOutcome("running");
    try {
      const result = await props.services.revokeSession!(target.id, {
        signal: props.signal,
        ...(target.revision === undefined
          ? {}
          : { expectedRevision: target.revision }),
      });
      if (props.activation.isCurrent() && !props.signal.aborted) {
        setOutcome(result.revoked ? "revoked" : "unchanged");
        setConfirmation(false);
      }
    } catch {
      if (props.activation.isCurrent() && !props.signal.aborted) {
        setOutcome("error");
        setConfirmation(false);
      }
    } finally {
      running.current = false;
    }
  }
  return (
    <section
      aria-label="Session"
      {...stylex.props(styles.page, styles.detailPage)}
    >
      <ConsolePageScope
        scopeKey={props.activation.key}
        value={{
          context: {
            kind: "object",
            label: "Session",
            ...(id === undefined ? {} : { id }),
            ...(props.canReturnToSessions
              ? {
                  return: {
                    label: "Return to sessions",
                    onInvoke: () => {
                      if (
                        !running.current &&
                        !props.signal.aborted &&
                        props.activation.isCurrent()
                      ) {
                        props.navigation.go("sessions");
                      }
                    },
                  },
                }
              : {}),
          },
        }}
      />
      <Load {...props} load={load}>
        {(session) =>
          session === null ? (
            <p {...stylex.props(styles.message)}>Session not found.</p>
          ) : (
            <>
              <header {...stylex.props(styles.detailIdentity)}>
                <p {...stylex.props(styles.label)}>Subject</p>
                <Typography.Heading level={1} xstyle={styles.subjectHeading}>
                  {session.subjectId}
                </Typography.Heading>
                <dl {...stylex.props(styles.sessionIdentity)}>
                  <dt {...stylex.props(styles.label)}>Session ID</dt>
                  <dd {...stylex.props(styles.value, styles.identifier)}>
                    {session.id}
                  </dd>
                </dl>
              </header>
              <Separator />
              <div {...stylex.props(styles.detailGroups)}>
                <section aria-labelledby="session-identity">
                  <Typography.Heading
                    level={2}
                    id="session-identity"
                    xstyle={styles.groupHeading}
                  >
                    Session properties
                  </Typography.Heading>
                  <dl {...stylex.props(styles.detailMetadata)}>
                    <div {...stylex.props(styles.detailField)}>
                      <dt {...stylex.props(styles.label)}>Realm</dt>
                      <dd {...stylex.props(styles.value)}>{session.realmId}</dd>
                    </div>
                    {session.kind !== undefined && (
                      <div {...stylex.props(styles.detailField)}>
                        <dt {...stylex.props(styles.label)}>Kind</dt>
                        <dd {...stylex.props(styles.value)}>{session.kind}</dd>
                      </div>
                    )}
                    {session.revision !== undefined && (
                      <div {...stylex.props(styles.detailField)}>
                        <dt {...stylex.props(styles.label)}>Revision</dt>
                        <dd {...stylex.props(styles.value)}>
                          {session.revision}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
                <section aria-labelledby="session-lifetime">
                  <Typography.Heading
                    level={2}
                    id="session-lifetime"
                    xstyle={styles.groupHeading}
                  >
                    Lifetime
                  </Typography.Heading>
                  <dl {...stylex.props(styles.detailMetadata)}>
                    <div {...stylex.props(styles.detailField)}>
                      <dt {...stylex.props(styles.label)}>Created (UTC)</dt>
                      <dd {...stylex.props(styles.value)}>
                        <Timestamp value={session.createdAt} />
                      </dd>
                    </div>
                    {session.lastActiveAt !== undefined && (
                      <div {...stylex.props(styles.detailField)}>
                        <dt {...stylex.props(styles.label)}>
                          Last active (UTC)
                        </dt>
                        <dd {...stylex.props(styles.value)}>
                          <Timestamp value={session.lastActiveAt} />
                        </dd>
                      </div>
                    )}
                    <div {...stylex.props(styles.detailField)}>
                      <dt {...stylex.props(styles.label)}>
                        Stored expiry (UTC)
                      </dt>
                      <dd {...stylex.props(styles.value)}>
                        <Timestamp value={session.expiresAt} />
                      </dd>
                    </div>
                    <div {...stylex.props(styles.detailField)}>
                      <dt {...stylex.props(styles.label)}>Revocation</dt>
                      <dd {...stylex.props(styles.value, styles.status)}>
                        {outcome === "error"
                          ? "Unknown. Reload to inspect."
                          : session.revokedAt !== undefined ||
                              outcome === "revoked"
                            ? "Revoked"
                            : "Not revoked"}
                      </dd>
                    </div>
                    {session.revokedAt !== undefined && (
                      <div {...stylex.props(styles.detailField)}>
                        <dt {...stylex.props(styles.label)}>Revoked (UTC)</dt>
                        <dd {...stylex.props(styles.value)}>
                          <Timestamp value={session.revokedAt} />
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              </div>
              {props.services.capabilities.sessionRevoke &&
                props.services.revokeSession &&
                session.revokedAt === undefined &&
                outcome !== "revoked" && (
                  <ConsoleLayout.Corner area="topRight">
                    <ConsoleIconButton
                      ref={opener}
                      label="Revoke session"
                      side="bottom"
                      variant="danger-soft"
                      type="button"
                      disabled={outcome === "error" || outcome === "running"}
                      onClick={() => {
                        if (
                          running.current ||
                          outcome === "error" ||
                          props.signal.aborted ||
                          !props.activation.isCurrent()
                        ) {
                          return;
                        }
                        setTarget({
                          id: session.id,
                          subjectId: session.subjectId,
                          ...(session.revision === undefined
                            ? {}
                            : { revision: session.revision }),
                        });
                        setConfirmation(true);
                      }}
                    >
                      <DangerIcon aria-hidden="true" width={20} height={20} />
                    </ConsoleIconButton>
                  </ConsoleLayout.Corner>
                )}
            </>
          )
        }
      </Load>
      <AlertDialog.Root
        open={confirmation}
        onOpenChange={(open, details) => {
          if (running.current) {
            details.cancel();
            return;
          }
          if (!open) {
            setConfirmation(false);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Viewport>
            <AlertDialog.Popup
              initialFocus={cancelButton}
              finalFocus={() => {
                if (!props.activation.isCurrent() || props.signal.aborted) {
                  return false;
                }
                if (outcome === "revoked") {
                  return feedback.current;
                }
                if (outcome === "error") {
                  return errorFeedback.current;
                }
                return opener.current;
              }}
              aria-busy={outcome === "running"}
            >
              <AlertDialog.Header>
                <AlertDialog.Title>Revoke this session?</AlertDialog.Title>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <dl {...stylex.props(styles.detailMetadata)}>
                  <div {...stylex.props(styles.detailField)}>
                    <dt {...stylex.props(styles.label)}>Subject</dt>
                    <dd {...stylex.props(styles.value)}>{target?.subjectId}</dd>
                  </div>
                  <div {...stylex.props(styles.detailField)}>
                    <dt {...stylex.props(styles.label)}>Session ID</dt>
                    <dd {...stylex.props(styles.value, styles.identifier)}>
                      {target?.id}
                    </dd>
                  </div>
                </dl>
                <AlertDialog.Description>
                  This ends access through this session. Other sessions for this
                  subject are not affected.
                </AlertDialog.Description>
                {outcome === "running" && <output>Revoking session…</output>}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  ref={cancelButton}
                  type="button"
                  variant="outline"
                  xstyle={styles.button}
                  disabled={outcome === "running"}
                  onClick={() => {
                    if (!running.current) {
                      setConfirmation(false);
                    }
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  xstyle={styles.button}
                  disabled={outcome === "running"}
                  onClick={() => void revoke()}
                >
                  Confirm revocation
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {outcome === "running" && (
        <output {...stylex.props(styles.message)}>Revoking session…</output>
      )}
      {outcome === "revoked" && (
        <output ref={feedback} tabIndex={-1} {...stylex.props(styles.message)}>
          Session revoked.
        </output>
      )}
      {outcome === "unchanged" && (
        <output {...stylex.props(styles.message)}>No change reported.</output>
      )}
      {outcome === "error" && (
        <p
          role="alert"
          ref={errorFeedback}
          tabIndex={-1}
          {...stylex.props(styles.message, styles.error)}
        >
          Revocation could not be confirmed. Reload or inspect this session and
          its audit outcome before retrying. The request may have taken effect.
        </p>
      )}
    </section>
  );
}

export function SubjectsPage(props: Props) {
  return <Subjects key={props.activation.key} {...props} />;
}

function Subjects(props: Props) {
  const load = useCallback(
    (signal: AbortSignal) => props.services.listSubjects!({ signal }),
    [props.services]
  );
  return (
    <section aria-label="Subjects" {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={props.activation.key}
        value={{ context: { kind: "object", label: "Subjects" } }}
      />
      <Load {...props} load={load}>
        {(subjects) =>
          subjects.length === 0 ? (
            <p {...stylex.props(styles.message)}>No subjects found.</p>
          ) : (
            <Table.Root variant="secondary">
              <Table.ScrollContainer>
                <Table.Content
                  aria-label="Subjects"
                  selectionMode="none"
                  xstyle={styles.subjectTable}
                >
                  <Table.Header>
                    <Table.Column
                      columnKey="label"
                      width="1.2fr"
                      minWidth={100}
                    >
                      Label
                    </Table.Column>
                    <Table.Column columnKey="id" width="1.5fr" minWidth={120}>
                      Subject ID
                    </Table.Column>
                    <Table.Column columnKey="realm" width="1fr" minWidth={90}>
                      Realm
                    </Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {subjects.map((subject) => {
                      const key = JSON.stringify([
                        subject.realmId,
                        subject.subjectId,
                      ]);
                      return (
                        <Table.Row
                          key={key}
                          itemKey={key}
                          textValue={subject.label ?? subject.subjectId}
                        >
                          <Table.Cell
                            columnKey="label"
                            xstyle={styles.subjectCell}
                          >
                            {subject.label ?? (
                              <span {...stylex.props(styles.label)}>
                                Not provided
                              </span>
                            )}
                          </Table.Cell>
                          <Table.Cell
                            columnKey="id"
                            xstyle={styles.subjectCell}
                          >
                            {subject.subjectId}
                          </Table.Cell>
                          <Table.Cell
                            columnKey="realm"
                            xstyle={styles.subjectCell}
                          >
                            {subject.realmId}
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table.Root>
          )
        }
      </Load>
    </section>
  );
}
