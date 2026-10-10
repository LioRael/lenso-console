import type { ConsoleLocalPageProps } from "@lenso/console-react";
import { Button } from "@lenso/ui/button";
import { Link } from "@lenso/ui/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { AuthConsoleClient, SessionPageDTO } from "./contracts";

type Props = ConsoleLocalPageProps<AuthConsoleClient>;
type Result<T> =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; value: T };

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
    return <output>Loading…</output>;
  }
  if (result.state === "error") {
    return <p role="alert">Unable to load this Auth view.</p>;
  }
  return children(result.value);
}

export function InfoPage(props: Props) {
  return <Info key={props.activation.key} {...props} />;
}

function Info(props: Props) {
  const load = useCallback(
    (signal: AbortSignal) => props.services.info!({ signal }),
    [props.services]
  );
  return (
    <section aria-label="Auth information">
      <h1>Auth information</h1>
      <Load {...props} load={load}>
        {(info) => (
          <dl>
            <dt>Realm</dt>
            <dd>{info.realm}</dd>
            <dt>Source</dt>
            <dd>{info.source}</dd>
            <dt>Policy</dt>
            <dd>{info.policy}</dd>
          </dl>
        )}
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
  const request = useRef<AbortController | null>(null);
  const fetchPage = useCallback(
    async (cursor?: string) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const signal = AbortSignal.any([controller.signal, props.signal]);
      setBusy(true);
      setError(false);
      if (cursor === undefined) {
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
  return (
    <section aria-label="Sessions">
      <h1>Sessions</h1>
      <Button
        size="lg"
        variant="outline"
        type="button"
        onClick={() => void fetchPage()}
      >
        Refresh sessions
      </Button>
      {busy && <output>Loading sessions…</output>}
      {error && (
        <p role="alert">Unable to load sessions. Refresh to try again.</p>
      )}
      {result.state === "ready" && (
        <>
          {result.value.sessions.length === 0 ? (
            <p>No sessions found.</p>
          ) : (
            <ul>
              {result.value.sessions.map((session) => (
                <li key={session.id}>
                  {props.services.capabilities.sessionDetail &&
                  props.services.readSession ? (
                    <Link
                      href={props.navigation.href("session", {
                        id: session.id,
                      })}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: "inherit",
                        minHeight: 44,
                        minWidth: 44,
                      }}
                    >
                      {session.id}
                    </Link>
                  ) : (
                    <span>{session.id}</span>
                  )}
                  <dl>
                    <dt>Subject</dt>
                    <dd>{session.subjectId}</dd>
                    <dt>Expires</dt>
                    <dd>{new Date(session.expiresAt).toISOString()}</dd>
                    <dt>Status</dt>
                    <dd>
                      {session.revokedAt === undefined
                        ? "Not revoked"
                        : "Revoked"}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
          )}
          {props.services.listSessionPage &&
            result.value.nextCursor !== null && (
              <Button
                size="lg"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() =>
                  void fetchPage(result.value.nextCursor ?? undefined)
                }
              >
                Load more sessions
              </Button>
            )}
        </>
      )}
    </section>
  );
}

export function SessionPage(props: Props) {
  return (
    <Session key={`${props.activation.key}:${props.params.id}`} {...props} />
  );
}

function Session(props: Props) {
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
  const [outcome, setOutcome] = useState<
    "idle" | "running" | "revoked" | "unchanged" | "error"
  >("idle");
  const running = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLOutputElement>(null);
  const errorFeedback = useRef<HTMLParagraphElement>(null);
  const previousConfirmation = useRef(false);
  useEffect(() => {
    if (confirmation) {
      confirmButton.current?.focus();
    } else if (previousConfirmation.current) {
      if (outcome === "revoked") {
        feedback.current?.focus();
      } else if (outcome === "error") {
        errorFeedback.current?.focus();
      } else {
        opener.current?.focus();
      }
    }
    previousConfirmation.current = confirmation;
  }, [confirmation, outcome]);
  async function revoke(expectedRevision?: number) {
    if (
      !id ||
      !props.activation.isCurrent() ||
      props.signal.aborted ||
      running.current
    ) {
      return;
    }
    running.current = true;
    setOutcome("running");
    try {
      const result = await props.services.revokeSession!(id, {
        signal: props.signal,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
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
  function onConfirmationKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && outcome !== "running") {
      event.preventDefault();
      event.stopPropagation();
      setConfirmation(false);
    }
  }
  return (
    <section aria-label="Session">
      <h1>Session</h1>
      <Load {...props} load={load}>
        {(session) =>
          session === null ? (
            <p>Session not found.</p>
          ) : (
            <>
              <dl>
                <dt>ID</dt>
                <dd>{session.id}</dd>
                <dt>Realm</dt>
                <dd>{session.realmId}</dd>
                <dt>Subject</dt>
                <dd>{session.subjectId}</dd>
                {session.revision !== undefined && (
                  <>
                    <dt>Revision</dt>
                    <dd>{session.revision}</dd>
                  </>
                )}
                <dt>Created</dt>
                <dd>{new Date(session.createdAt).toISOString()}</dd>
                <dt>Expires</dt>
                <dd>{new Date(session.expiresAt).toISOString()}</dd>
                <dt>Status</dt>
                <dd>
                  {outcome === "error"
                    ? "Unknown. Reload to inspect."
                    : session.revokedAt !== undefined || outcome === "revoked"
                      ? "Revoked"
                      : "Not revoked"}
                </dd>
              </dl>
              {props.services.capabilities.sessionRevoke &&
                props.services.revokeSession &&
                session.revokedAt === undefined &&
                outcome !== "revoked" &&
                (confirmation ? (
                  <fieldset aria-label="Confirm session revocation">
                    <p>
                      Revoke session {session.id}? This ends access through this
                      session.
                    </p>
                    <Button
                      ref={confirmButton}
                      size="lg"
                      variant="outline"
                      type="button"
                      disabled={outcome === "running"}
                      onKeyDown={onConfirmationKeyDown}
                      onClick={() => void revoke(session.revision)}
                    >
                      Confirm revocation
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      disabled={outcome === "running"}
                      onKeyDown={onConfirmationKeyDown}
                      onClick={() => setConfirmation(false)}
                    >
                      Cancel
                    </Button>
                  </fieldset>
                ) : (
                  <Button
                    ref={opener}
                    size="lg"
                    variant="outline"
                    type="button"
                    disabled={outcome === "error"}
                    onClick={() => setConfirmation(true)}
                  >
                    Revoke session
                  </Button>
                ))}
            </>
          )
        }
      </Load>
      {outcome === "running" && <output>Revoking session…</output>}
      {outcome === "revoked" && (
        <output ref={feedback} tabIndex={-1}>
          Session revoked.
        </output>
      )}
      {outcome === "unchanged" && <output>No change reported.</output>}
      {outcome === "error" && (
        <p role="alert" ref={errorFeedback} tabIndex={-1}>
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
    <section aria-label="Subjects">
      <h1>Subjects</h1>
      <Load {...props} load={load}>
        {(subjects) =>
          subjects.length === 0 ? (
            <p>No subjects found.</p>
          ) : (
            <ul>
              {subjects.map((subject) => (
                <li key={`${subject.realmId}:${subject.subjectId}`}>
                  {subject.label ?? subject.subjectId} ({subject.realmId})
                </li>
              ))}
            </ul>
          )
        }
      </Load>
    </section>
  );
}
