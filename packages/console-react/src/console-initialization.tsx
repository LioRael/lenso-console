import { Button } from "@lenso/ui/button";
import { Card } from "@lenso/ui/card";
import { Drawer } from "@lenso/ui/drawer";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ComponentType } from "react";

import { useConsoleActivation } from "./console-activation";
import { ConsoleIconButton } from "./console-icon-button";
import {
  parseConsoleInitializationStatus,
  type ConsoleInitializationClient,
  type ConsoleInitializationStatus,
} from "./console-initialization-model";

export interface ConsoleInitializationFormProps<Input, Draft> {
  /** Explicit non-secret fields only; the Plugin retains this controlled draft. */
  draft: Draft;
  onDraftChange(draft: Draft): void;
  onSubmit(input: Input): Promise<void>;
}
export interface ConsoleInitializationProps<Input, Draft> {
  /** Trusted host/instance/initializer identity; a UI key is never authorization. */
  scopeKey: string;
  signal: AbortSignal;
  target: { label: string; platform: "native" | "workers" };
  client?: ConsoleInitializationClient<Input>;
  /** A stable non-secret idempotency ID, retained by this Plugin's host. */
  requestId: string;
  draft: Draft;
  onDraftChange(draft: Draft): void;
  form?: ComponentType<ConsoleInitializationFormProps<Input, Draft>>;
  /** Existing trusted owner instructions; never a platform credential writer. */
  repair?: { label: string; href: string };
  onContinue?(): void;
}

const styles = stylex.create({
  page: {
    maxWidth: 760,
    width: "100%",
    marginInline: "auto",
    paddingInline: 24,
    paddingBlock: 80,
    color: "var(--foreground)",
    overflowWrap: "anywhere",
  },
  title: { margin: 0, fontSize: 25, fontWeight: 600, lineHeight: 1.35 },
  description: {
    fontSize: 13,
    color: "var(--muted)",
    lineHeight: 1.6,
    marginBlock: 12,
  },
  card: { marginBlockStart: 24, padding: 22, borderRadius: 20, gap: 14 },
  heading: { fontSize: 16, fontWeight: 550, margin: 0 },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, marginBlockStart: 8 },
  button: { minHeight: { default: 36, "@media (pointer: coarse)": 44 } },
  repair: { fontSize: 13, lineHeight: 1.6 },
  blockers: {
    margin: 0,
    paddingInlineStart: 18,
    fontSize: 13,
    lineHeight: 1.7,
  },
  revision: { fontSize: 12, color: "var(--muted)" },
  popup: {
    width: "min(480px, 100%)",
    maxWidth: "100%",
    height: "100%",
    maxHeight: "100dvh",
    color: "var(--foreground)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  header: {
    display: "flex",
    flexDirection: "row",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 16,
  },
  body: { overflowY: "auto", minHeight: 0, paddingBlockEnd: 32 },
  error: {
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--danger)",
    marginBlock: 12,
  },
});
const labels = {
  uninitialized: "Not initialized",
  blocked: "Setup blocked",
  awaiting_activation: "Awaiting activation",
  ready: "Ready for startup",
};
const descriptions = {
  uninitialized:
    "This host has confirmed a new instance. Configure its first owner and required application settings.",
  blocked:
    "Required configuration or a host capability needs attention. Business startup remains closed.",
  awaiting_activation:
    "The owner and configuration have been committed. Resume this revision without submitting credentials again.",
  ready:
    "This revision is qualified for business startup. This does not mean a server is running or a provider has been called.",
};
const blockerText = {
  "database-unavailable":
    "The authoritative database is unavailable. Ask its existing owner to restore access.",
  "external-configuration-required":
    "Required external configuration is missing. Use the trusted configuration owner.",
  "activation-failed":
    "Activation did not complete. Repair the host, then resume the same revision.",
  "configuration-invalid":
    "The selected environment does not match the application's configuration contract.",
};

function failureMessage(
  action: "status" | "apply" | "activate",
  error: unknown
) {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "initialization-unauthorized") {
    return "Current host authorization is required. Obtain it from the trusted host owner, then check status.";
  }
  if (code === "initialization-closed" || code === "initialization-conflict") {
    return "First-owner setup is closed or conflicts with a committed request. Check status before continuing.";
  }
  if (code === "initialization-invalid-input") {
    return "Input did not match the application's setup contract. Check status before retrying.";
  }
  return action === "status"
    ? "Setup status is unavailable. No new-instance state has been assumed. Check status or contact the host owner."
    : "The operation's result is not confirmed. Check status before retrying; the owner may already have been committed.";
}

/** Presentation only: no automatic routes, authorization, storage or platform writes. */
export function ConsoleInitialization<Input, Draft>(
  props: ConsoleInitializationProps<Input, Draft>
) {
  return <InitializationSession key={props.scopeKey} {...props} />;
}
function InitializationSession<Input, Draft>({
  client,
  signal: parentSignal,
  target,
  requestId,
  draft,
  onDraftChange,
  form,
  repair,
  onContinue,
}: ConsoleInitializationProps<Input, Draft>) {
  const { activation, signal } = useConsoleActivation(client, parentSignal);
  const [status, setStatus] = useState<ConsoleInitializationStatus>();
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState<"status" | "apply" | "activate">();
  const [problem, setProblem] = useState("");
  const [open, setOpen] = useState(false);
  const focus = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const pending = useRef<AbortController | null>(null);
  const gate = useRef<{
    status?: ConsoleInitializationStatus;
    verified: boolean;
  }>({ verified: false });
  const validRequest = /^[A-Za-z0-9_-]{8,128}$/u.test(requestId);
  const execute = async (
    action: "status" | "apply" | "activate",
    input?: Input
  ) => {
    if (pending.current || !client || !activation.isCurrent()) {
      return;
    }
    const latest = gate.current;
    if (
      action === "apply" &&
      (!latest.verified ||
        latest.status?.nextAction !== "apply" ||
        latest.status.revision !== null ||
        !validRequest)
    ) {
      return;
    }
    if (
      action === "activate" &&
      (!latest.verified ||
        latest.status?.nextAction !== "activate" ||
        latest.status.revision === null)
    ) {
      return;
    }
    const request = new AbortController();
    const lifetime = AbortSignal.any([signal, request.signal]);
    const current = () =>
      pending.current === request &&
      activation.isCurrent() &&
      !lifetime.aborted;
    pending.current = request;
    gate.current.verified = false;
    setVerified(false);
    setBusy(action);
    setProblem("");
    try {
      const result =
        action === "status"
          ? await client.status({ signal: lifetime })
          : action === "apply"
            ? await client.apply(
                { requestId, input: input as Input },
                { signal: lifetime }
              )
            : await client.activate({ signal: lifetime });
      if (!current()) {
        return;
      }
      const next = parseConsoleInitializationStatus(result);
      gate.current = { status: next, verified: true };
      setStatus(next);
      setVerified(true);
    } catch (error) {
      if (current()) {
        setProblem(failureMessage(action, error));
      }
    } finally {
      if (pending.current === request) {
        pending.current = null;
        if (activation.isCurrent()) {
          setBusy(undefined);
        }
      }
    }
  };
  useLayoutEffect(() => {
    gate.current = { verified: false };
    setVerified(false);
    setStatus(undefined);
    void execute("status");
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
    // A client/lease replacement requires a fresh status. Draft edits must not poll.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [client, signal]);
  const canApply =
    verified &&
    status?.nextAction === "apply" &&
    status.revision === null &&
    validRequest;
  const canActivate =
    verified && status?.nextAction === "activate" && status.revision !== null;
  const summary = (
    <>
      <output {...stylex.props(styles.heading)}>
        {busy
          ? {
              status: "Checking setup",
              apply: "Submitting setup",
              activate: "Activating revision",
            }[busy]
          : !verified && status
            ? "Status needs confirmation"
            : status
              ? labels[status.state]
              : "Setup connection required"}
      </output>
      {verified && status && (
        <p {...stylex.props(styles.description)}>
          {descriptions[status.state]}
        </p>
      )}
      {status?.revision && (
        <p {...stylex.props(styles.revision)}>
          Revision: <code>{status.revision}</code>
        </p>
      )}
      {verified && !!status?.blockers.length && (
        <ul {...stylex.props(styles.blockers)}>
          {status.blockers.map((blocker, index) => (
            <li key={`${blocker.code}-${index}`}>
              {blockerText[blocker.code]}
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p role="alert" {...stylex.props(styles.error)}>
          {problem}
        </p>
      )}
    </>
  );
  const actions = (
    <>
      <Button
        xstyle={styles.button}
        variant="secondary"
        disabled={!client || !!busy}
        onClick={() => void execute("status")}
      >
        Check status
      </Button>
      {canActivate && (
        <Button
          xstyle={styles.button}
          variant="primary"
          disabled={!!busy}
          onClick={() => void execute("activate")}
        >
          Resume activation
        </Button>
      )}
      {verified && status?.state === "ready" && onContinue && (
        <Button
          xstyle={styles.button}
          variant="primary"
          onClick={() => {
            if (
              activation.isCurrent() &&
              gate.current.verified &&
              gate.current.status?.state === "ready"
            ) {
              onContinue();
            }
          }}
        >
          Continue to application
        </Button>
      )}
    </>
  );
  return (
    <section aria-label="Application setup" {...stylex.props(styles.page)}>
      <h1 {...stylex.props(styles.title)}>Application setup</h1>
      <p {...stylex.props(styles.description)}>
        {target.label} ·{" "}
        {target.platform === "native" ? "Native host" : "Workers host"}
      </p>
      <Card variant="secondary" xstyle={styles.card}>
        {summary}
        {!client && (
          <p {...stylex.props(styles.description)}>
            This host has not connected a trusted setup entry. No account or
            configuration can be submitted here.
          </p>
        )}
        {client && !form && (
          <p {...stylex.props(styles.description)}>
            This plugin has not installed an input form. Use its existing
            trusted setup owner.
          </p>
        )}
        {!validRequest && (
          <p role="alert" {...stylex.props(styles.error)}>
            A valid host-owned request ID is required before submission.
          </p>
        )}
        {target.platform === "workers" && (
          <p {...stylex.props(styles.description)}>
            The deployment owner must stage required platform configuration and
            activate the selected revision. This page cannot change platform
            credentials or infer activation from an upload.
          </p>
        )}
        {repair && (
          <a href={repair.href} {...stylex.props(styles.repair)}>
            {repair.label}
          </a>
        )}
        <div {...stylex.props(styles.actions)}>
          {actions}
          {client && form && validRequest && (
            <Button
              xstyle={styles.button}
              ref={opener}
              variant="primary"
              onClick={() => {
                setOpen(true);
                void execute("status");
              }}
            >
              {canApply ? "Configure this instance" : "View setup"}
            </Button>
          )}
        </div>
      </Card>
      <Drawer.Root open={open} swipeDirection="right" onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Backdrop variant="opaque" />
          <Drawer.Viewport>
            <Drawer.Popup
              initialFocus={focus}
              finalFocus={opener}
              xstyle={styles.popup}
            >
              <Drawer.Content xstyle={styles.content}>
                <Drawer.Header xstyle={styles.header}>
                  <div>
                    <Drawer.Title ref={focus} tabIndex={-1}>
                      First-time setup
                    </Drawer.Title>
                    <Drawer.Description>
                      Non-secret draft fields remain with this plugin. Closing
                      clears password and key fields.
                    </Drawer.Description>
                  </div>
                  <ConsoleIconButton
                    label="Close setup"
                    variant="secondary"
                    onClick={() => setOpen(false)}
                  >
                    <X size={18} aria-hidden="true" />
                  </ConsoleIconButton>
                </Drawer.Header>
                <Drawer.Body xstyle={styles.body}>
                  {summary}
                  {open && canApply && !busy && form && (
                    <InitializationForm
                      form={form}
                      draft={draft}
                      onDraftChange={onDraftChange}
                      onSubmit={(input) => execute("apply", input)}
                      signal={signal}
                    />
                  )}
                  <div {...stylex.props(styles.actions)}>{actions}</div>
                </Drawer.Body>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </section>
  );
}

function InitializationForm<Input, Draft>({
  form: Form,
  draft,
  onDraftChange,
  onSubmit,
  signal,
}: ConsoleInitializationFormProps<Input, Draft> & {
  form: ComponentType<ConsoleInitializationFormProps<Input, Draft>>;
  signal: AbortSignal;
}) {
  const { activation } = useConsoleActivation(Form, signal);
  return (
    <Form
      draft={draft}
      onDraftChange={(next) => {
        if (activation.isCurrent()) {
          onDraftChange(next);
        }
      }}
      onSubmit={async (input) => {
        if (activation.isCurrent()) {
          await onSubmit(input);
        }
      }}
    />
  );
}
