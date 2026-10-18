import {
  bindConsole,
  ConsoleDockContent,
  ConsoleIconButton,
  defineConsolePlugin,
  type ConsoleDockViewProps,
} from "@lenso/console-react";
import { Button } from "@lenso/ui/button";
import { Disclosure } from "@lenso/ui/disclosure";
import { InputGroup } from "@lenso/ui/input-group";
import { Toolbar } from "@lenso/ui/toolbar";
import * as stylex from "@stylexjs/stylex";
import { ArrowUp, Bot, Check, Link, RefreshCw, Square, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { agentMessageText, type AgentAction } from "./client";
import {
  agentConnectionState,
  useAgentConversation,
  type AgentConsoleServices,
} from "./conversation";

export type { AgentConsoleServices } from "./conversation";

const styles = stylex.create({
  form: { display: "flex", alignItems: "center", minWidth: 0, width: "100%" },
  inputGroup: {
    width: "100%",
    backgroundColor: "transparent",
    boxShadow: "none",
    borderRadius: 24,
    minWidth: 0,
  },
  input: {
    resize: "none",
    minHeight: { default: 36, "@media (pointer: coarse)": 44 },
    maxHeight: 96,
    paddingBlock: 8,
    paddingInline: 10,
    fontSize: 14,
    lineHeight: 1.4,
    backgroundColor: "transparent",
    borderRadius: 20,
  },
  suffix: { paddingInlineEnd: 2 },
  transcript: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 4,
    minWidth: 0,
  },
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  identity: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 13,
    minWidth: 0,
  },
  muted: {
    color: "var(--muted)",
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    overflowWrap: "anywhere",
  },
  empty: {
    display: "flex",
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 10,
    paddingBlock: 20,
    paddingInline: 12,
  },
  title: { fontSize: 16, fontWeight: 550, lineHeight: 1.4, margin: 0 },
  log: { display: "flex", flexDirection: "column", gap: 16 },
  message: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    maxWidth: "100%",
  },
  user: {
    alignSelf: "flex-end",
    maxWidth: "90%",
    backgroundColor: "var(--surface-secondary)",
    borderRadius: 20,
    paddingBlock: 10,
    paddingInline: 14,
  },
  text: {
    fontSize: 14,
    lineHeight: 1.65,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    margin: 0,
  },
  role: { fontSize: 11, color: "var(--muted)", fontWeight: 500 },
  notice: {
    borderRadius: 12,
    backgroundColor: "var(--surface-secondary)",
    padding: 10,
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
  },
  error: { color: "var(--danger)", fontSize: 13, lineHeight: 1.5, margin: 0 },
  action: {
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  target: {
    fontSize: 12,
    lineHeight: 1.6,
    overflowWrap: "anywhere",
    margin: 0,
  },
  pre: {
    maxHeight: 200,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: 12,
    margin: 0,
    paddingBlock: 10,
  },
  tools: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
});
const connectionStates = {
  ready: {
    title: "Connected",
    detail:
      "The application has selected this Agent connection. Tool and session authorization remain with its server.",
  },
  disconnected: {
    title: "Connect your Agent",
    detail:
      "This application has not connected an Agent service. Open its connection settings to continue.",
  },
  "model-required": {
    title: "Select a model",
    detail:
      "The host has not selected a model for this Agent profile. Choose one in the existing provider settings.",
  },
  reauthorize: {
    title: "Reconnect your account",
    detail:
      "This connection needs authorization again. Reauthorize through the application before submitting.",
  },
  revoked: {
    title: "Access was revoked",
    detail:
      "The connection no longer has the required access. Review access with the application operator.",
  },
  disabled: {
    title: "Agent is disabled",
    detail:
      "This Agent connection is disabled. Open its existing settings to review availability.",
  },
  unknown: {
    title: "Connection status is unknown",
    detail:
      "The application has not supplied a reliable connection state. Check its connection settings before submitting.",
  },
} as const;

function ToolReview({
  action,
  busy,
  running,
  decide,
}: {
  action: AgentAction;
  busy: boolean;
  running: boolean;
  decide(action: AgentAction, confirm: boolean): Promise<void>;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(1, Math.min(2_147_483_647, action.expiresAt - Date.now() + 1))
    );
    return () => clearTimeout(timer);
  }, [action.expiresAt]);
  const expired = action.expiresAt <= now;
  const input = JSON.stringify(action.prepared.input, null, 2) ?? "null";
  const reviewable = input.length <= 64 * 1024;
  const { target } = action.prepared.definition;
  const pending = action.status === "pending";
  return (
    <section
      aria-label={`Tool action ${action.prepared.definition.name}`}
      {...stylex.props(styles.action)}
    >
      <strong>{action.prepared.definition.name}</strong>
      <p {...stylex.props(styles.muted)}>
        {action.prepared.definition.description}
      </p>
      <p {...stylex.props(styles.target)}>
        {target.application} / {target.instance} / {target.plugin} /{" "}
        {target.operation}
      </p>
      <p {...stylex.props(styles.muted)}>
        Effect: {action.prepared.definition.effect} ·{" "}
        {action.status.replaceAll("_", " ")}
      </p>
      <Disclosure>
        <Disclosure.Trigger>
          Review exact input
          <Disclosure.Indicator />
        </Disclosure.Trigger>
        <Disclosure.Content>
          <Disclosure.Body>
            <pre {...stylex.props(styles.pre)}>
              {reviewable
                ? input
                : "Input is too large to review here. Inspect it in the owning application before approval."}
            </pre>
            {action.prepared.precondition && (
              <p {...stylex.props(styles.muted)}>
                Precondition: {action.prepared.precondition}
              </p>
            )}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
      <p {...stylex.props(styles.muted)}>
        Valid until {new Date(action.expiresAt).toLocaleString()}
        {expired ? " · Expired" : ""}
      </p>
      {action.status === "outcome_unknown" && (
        <p role="alert" {...stylex.props(styles.notice)}>
          The outcome is unknown. Check the owning service; this action will not
          be retried automatically.
        </p>
      )}
      {pending && (
        <>
          {running && (
            <p {...stylex.props(styles.muted)}>
              Wait for the current run to finish before reviewing this action.
            </p>
          )}
          <Toolbar isAttached aria-label="Review tool action">
            <Toolbar.Button
              variant="secondary"
              disabled={busy || running || expired || !reviewable}
              onClick={() => void decide(action, true)}
            >
              <Check size={14} aria-hidden="true" />
              Approve this action
            </Toolbar.Button>
            <Toolbar.Button
              variant="secondary"
              disabled={busy || running || expired}
              onClick={() => void decide(action, false)}
            >
              <X size={14} aria-hidden="true" />
              Decline
            </Toolbar.Button>
          </Toolbar>
        </>
      )}
    </section>
  );
}

function AgentDock(props: ConsoleDockViewProps<AgentConsoleServices>) {
  const { dock } = props;
  const source = props.services.connectionSource;
  const subscribe = useCallback(
    (listener: () => void) => source?.subscribe(listener) ?? (() => undefined),
    [source]
  );
  const getConnection = useCallback(
    () => (source ? source.getSnapshot() : props.services.connection),
    [source, props.services.connection]
  );
  const connection = useSyncExternalStore(
    subscribe,
    getConnection,
    getConnection
  );
  const services = { ...props.services };
  if (connection) {
    services.connection = connection;
  } else {
    delete services.connection;
  }
  const conversation = useAgentConversation({ ...props, services });
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const connectionState = agentConnectionState(services);
  const connected = connectionState === "ready";
  const running = conversation.run?.status === "running";
  const messages = (conversation.snapshot?.messages ?? []).flatMap((item) => {
    // Agent persists approval outcomes as machine-authored user-role messages.
    // Their status belongs to ToolReview, not to a fabricated user chat bubble.
    if (item.source?.kind === "action-outcome") {
      return [];
    }
    const message = agentMessageText(item.value);
    return message?.text ? [{ id: item.id, ...message }] : [];
  });
  const configure = !connected && services.configure && (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => services.configure?.open()}
    >
      <Link size={14} aria-hidden="true" />
      {services.configure.label}
    </Button>
  );
  return (
    <ConsoleDockContent
      initialFocus={input}
      bar={
        <form
          {...stylex.props(styles.form)}
          onSubmit={(event) => {
            event.preventDefault();
            if (!composing.current) {
              void conversation.send();
            }
          }}
        >
          <InputGroup variant="secondary" xstyle={styles.inputGroup}>
            <InputGroup.TextArea
              ref={input}
              rows={1}
              aria-label="Message Agent"
              placeholder={
                connected ? "Ask Agent…" : "Connect an Agent to begin"
              }
              value={conversation.draft}
              readOnly={conversation.posting || !!conversation.pending}
              xstyle={styles.input}
              onChange={(event) => conversation.setDraft(event.target.value)}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onKeyDown={(event) => {
                if (
                  composing.current ||
                  event.nativeEvent.isComposing ||
                  event.keyCode === 229
                ) {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                  }
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void conversation.send();
                }
              }}
            />
            <InputGroup.Suffix xstyle={styles.suffix}>
              {connected ? (
                running ? (
                  <ConsoleIconButton
                    type="button"
                    label={
                      conversation.run?.cancelRequestedAt
                        ? "Stop requested"
                        : "Stop Agent"
                    }
                    variant="secondary"
                    disabled={
                      !!conversation.actionBusy ||
                      !!conversation.run?.cancelRequestedAt
                    }
                    onClick={() => void conversation.stop()}
                  >
                    <Square size={15} aria-hidden="true" />
                  </ConsoleIconButton>
                ) : (
                  <ConsoleIconButton
                    type="submit"
                    label="Send message"
                    variant="primary"
                    disabled={
                      !connected ||
                      conversation.posting ||
                      !!conversation.pending ||
                      !conversation.draft.trim()
                    }
                  >
                    <ArrowUp size={17} aria-hidden="true" />
                  </ConsoleIconButton>
                )
              ) : (
                <ConsoleIconButton
                  type="button"
                  label="Agent connection setup"
                  variant="secondary"
                  onClick={() => dock.expand()}
                >
                  <Link size={16} aria-hidden="true" />
                </ConsoleIconButton>
              )}
            </InputGroup.Suffix>
          </InputGroup>
        </form>
      }
      tray={{
        label: "Agent conversation",
        content: (
          <div {...stylex.props(styles.transcript)}>
            <header {...stylex.props(styles.heading)}>
              <div {...stylex.props(styles.identity)}>
                <strong>Agent</strong>
                <span {...stylex.props(styles.muted)}>
                  {connectionStates[connectionState].title}
                  {connection?.model ? ` · ${connection.model}` : ""}
                </span>
              </div>
              {configure}
            </header>
            <Disclosure>
              <Disclosure.Trigger>
                Connection details
                <Disclosure.Indicator />
              </Disclosure.Trigger>
              <Disclosure.Content>
                <Disclosure.Body>
                  <p {...stylex.props(styles.muted)}>
                    Provider: {connection?.provider ?? "Unknown"}
                  </p>
                  <p {...stylex.props(styles.muted)}>
                    Account: {connection?.account ?? "Unknown"}
                  </p>
                  <p {...stylex.props(styles.muted)}>
                    Model: {connection?.model ?? "Not selected"}
                  </p>
                  <p {...stylex.props(styles.muted)}>
                    Scope: {connection?.scope ?? "Unknown"}
                  </p>
                  <p {...stylex.props(styles.muted)}>
                    {connection?.testedAt
                      ? `Host-reported test: ${new Date(connection.testedAt).toLocaleString()}`
                      : "Not provider-tested. A configured connection is not a successful live test."}
                  </p>
                  <p {...stylex.props(styles.muted)}>
                    Price and quota: unknown.
                  </p>
                  {connected && connection?.usage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => connection.usage?.open()}
                    >
                      {connection.usage.label}
                    </Button>
                  )}
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
            {services.notice && (
              <p role="note" {...stylex.props(styles.notice)}>
                {services.notice}
              </p>
            )}
            {connected ? (
              !messages.length && !conversation.pending && !conversation.run ? (
                <div {...stylex.props(styles.empty)}>
                  <Bot size={24} aria-hidden="true" />
                  <h2 {...stylex.props(styles.title)}>
                    What would you like to do?
                  </h2>
                  <p {...stylex.props(styles.muted)}>
                    Ask a question or describe a task. Tools that need approval
                    will ask before they run.
                  </p>
                </div>
              ) : null
            ) : (
              <div {...stylex.props(styles.empty)}>
                <Bot size={24} aria-hidden="true" />
                <h2 {...stylex.props(styles.title)}>
                  {connectionStates[connectionState].title}
                </h2>
                <p {...stylex.props(styles.muted)}>
                  {connectionStates[connectionState].detail}
                </p>
                {!services.configure && (
                  <p {...stylex.props(styles.muted)}>
                    Contact the application operator to resolve this connection.
                  </p>
                )}
              </div>
            )}
            <div
              role="log"
              aria-label="Conversation messages"
              aria-live="off"
              {...stylex.props(styles.log)}
            >
              {messages.map((item) => (
                <article
                  key={item.id}
                  {...stylex.props(
                    styles.message,
                    item.role === "user" && styles.user
                  )}
                >
                  <span {...stylex.props(styles.role)}>
                    {item.role === "user" ? "You" : "Agent"}
                  </span>
                  <p {...stylex.props(styles.text)}>{item.text}</p>
                </article>
              ))}
              {conversation.pending && (
                <article {...stylex.props(styles.message, styles.user)}>
                  <span {...stylex.props(styles.role)}>
                    You ·{" "}
                    {conversation.posting
                      ? "Submitting"
                      : "Unconfirmed submission"}
                  </span>
                  <p {...stylex.props(styles.text)}>
                    {conversation.pending.text}
                  </p>
                </article>
              )}
              {conversation.delta && (
                <article {...stylex.props(styles.message)}>
                  <span {...stylex.props(styles.role)}>Agent · responding</span>
                  <p {...stylex.props(styles.text)}>{conversation.delta}</p>
                </article>
              )}
            </div>
            {(conversation.snapshot?.actions ?? []).map((action) => (
              <ToolReview
                key={action.id}
                action={action}
                busy={!connected || !!conversation.actionBusy}
                running={running}
                decide={conversation.decide}
              />
            ))}
            {conversation.run && (
              <output {...stylex.props(styles.muted)}>
                {conversation.run.cancelRequestedAt && running
                  ? "Stopping…"
                  : running
                    ? "Agent is working…"
                    : `Run ${conversation.run.status}.`}
              </output>
            )}
            {conversation.error && (
              <p role="alert" {...stylex.props(styles.error)}>
                {conversation.error}
              </p>
            )}
            {conversation.feedback && (
              <output {...stylex.props(styles.muted)}>
                {conversation.feedback}
              </output>
            )}
            <div {...stylex.props(styles.tools)}>
              {conversation.pending && !conversation.posting && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!connected}
                  onClick={() => void conversation.send(true)}
                >
                  Retry same message
                </Button>
              )}
              {conversation.reconnect && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => conversation.resume()}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Reconnect to run
                </Button>
              )}
            </div>
          </div>
        ),
      }}
    />
  );
}

const definition = defineConsolePlugin<AgentConsoleServices>({
  id: "agent-console",
  pages: {},
  dockViews: [
    {
      id: "agent",
      label: "Agent",
      icon: <Bot size={18} aria-hidden="true" />,
      component: AgentDock,
    },
  ],
});

/** Explicit local plugin installation. The application chooses the first leading entry. */
export function agentConsole(options: AgentConsoleServices & { id: string }) {
  return bindConsole(definition, {
    id: options.id,
    routes: {},
    services: options,
  });
}
