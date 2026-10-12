import { Button } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { ConsoleLayout } from "./console-layout";

export interface ConsoleLoginEntry {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly renderer?: string;
}

export interface ConsoleLoginProps<
  T extends ConsoleLoginEntry = ConsoleLoginEntry,
> {
  state:
    | "loading"
    | "authenticated"
    | "unauthenticated"
    | "expired"
    | "forbidden"
    | "unavailable";
  methods: readonly T[];
  busy?: boolean | undefined;
  error?: Error | undefined;
  onPassword: (
    method: T,
    input: { identifier: string; password: string }
  ) => void;
  onRedirect: (method: T) => void;
  onCustom?: (method: T, input: unknown) => void;
  onRetry: () => void;
  onCancel?: () => void;
  onLogout?: (() => void) | undefined;
  /** Application-local components only. Discovery cannot download or register UI. */
  renderers?: Readonly<
    Record<string, (method: T, props: ConsoleLoginProps<T>) => ReactNode>
  >;
  /** Replaces the complete login/status surface, without requiring a Plugin. */
  renderPage?: (props: ConsoleLoginProps<T>) => ReactNode;
}

const styles = stylex.create({
  main: {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: 448,
    marginInline: "auto",
    paddingInline: 24,
    paddingBlockStart: {
      default: "min(20dvh, 160px)",
      "@media (max-width: 640px)": 64,
    },
    paddingBlockEnd: 48,
    color: "var(--foreground)",
    overflowWrap: "anywhere",
  },
  heading: { marginBlock: 0, fontSize: 28, fontWeight: 600, lineHeight: 1.2 },
  description: { marginBlockStart: 12, marginBlockEnd: 28, lineHeight: 1.5 },
  methods: { display: "flex", flexDirection: "column", gap: 24 },
  form: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  label: { display: "flex", flexDirection: "column", gap: 8, fontSize: 14 },
  input: { width: "100%", minWidth: 0, minHeight: 44 },
  action: { minHeight: 44, whiteSpace: "normal" },
  actions: { display: "flex", flexWrap: "wrap", gap: 12, marginBlockStart: 20 },
  error: { marginBlockStart: 16, lineHeight: 1.5 },
});

const headings = {
  loading: "Connecting to Console",
  authenticated: "Console",
  unauthenticated: "Sign in to Console",
  expired: "Sign in again",
  forbidden: "No Console access",
  unavailable: "Console is unavailable",
};
const descriptions = {
  loading: "Checking your session.",
  authenticated: "",
  unauthenticated: "Use an account provided by this application.",
  expired: "Your session ended or changed. Sign in to continue.",
  forbidden:
    "You are signed in, but this account does not have access to Console.",
  unavailable:
    "The application could not confirm your access. Retry without changing your account.",
};

function Password<T extends ConsoleLoginEntry>({
  method,
  props,
  errorId,
}: {
  method: T;
  props: ConsoleLoginProps<T>;
  errorId: string;
}) {
  const id = useId();
  return (
    <form
      {...stylex.props(styles.form)}
      aria-label={method.label}
      aria-busy={props.busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (props.busy) {
          return;
        }
        const fields = new FormData(event.currentTarget);
        const input = {
          identifier: String(fields.get("identifier") ?? ""),
          password: String(fields.get("password") ?? ""),
        };
        // Credentials live only in the submitted form, not React or persistent storage.
        event.currentTarget.reset();
        props.onPassword(method, input);
      }}
    >
      <label {...stylex.props(styles.label)} htmlFor={`${id}-identifier`}>
        Account
        <Input
          id={`${id}-identifier`}
          name="identifier"
          autoComplete="username"
          required
          disabled={props.busy}
          aria-describedby={props.error ? errorId : undefined}
          xstyle={styles.input}
        />
      </label>
      <label {...stylex.props(styles.label)} htmlFor={`${id}-password`}>
        Password
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={props.busy}
          aria-describedby={props.error ? errorId : undefined}
          xstyle={styles.input}
        />
      </label>
      <Button
        size="lg"
        type="submit"
        disabled={props.busy}
        xstyle={styles.action}
      >
        {props.busy ? "Signing in…" : method.label}
      </Button>
    </form>
  );
}

/** Login presentation is independent of optional Plugin navigation and administration. */
export function ConsoleLogin<T extends ConsoleLoginEntry>(
  props: ConsoleLoginProps<T>
) {
  const heading = useRef<HTMLHeadingElement>(null);
  const errorId = useId();
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [props.state]);
  if (props.renderPage) {
    return props.renderPage(props);
  }
  const showMethods =
    props.state === "unauthenticated" || props.state === "expired";
  return (
    <ConsoleLayout topEdge={{ enabled: false }}>
      <main
        {...stylex.props(styles.main)}
        aria-busy={props.busy || props.state === "loading"}
      >
        <h1 ref={heading} tabIndex={-1} {...stylex.props(styles.heading)}>
          {headings[props.state]}
        </h1>
        <p
          {...stylex.props(styles.description)}
          role={props.state === "loading" ? "status" : undefined}
        >
          {descriptions[props.state]}
        </p>
        {props.state === "forbidden" && !props.onLogout && (
          <p>
            The application has not configured sign-out. Contact its operator to
            switch accounts.
          </p>
        )}
        {showMethods && (
          <div {...stylex.props(styles.methods)}>
            {props.methods.length === 0 && (
              <p>
                The application has not configured a login method. Contact its
                operator.
              </p>
            )}
            {props.methods.map((method) => {
              const rendererKey = method.renderer ?? method.kind;
              const renderer =
                props.renderers && Object.hasOwn(props.renderers, rendererKey)
                  ? props.renderers[rendererKey]
                  : undefined;
              if (renderer) {
                return <div key={method.id}>{renderer(method, props)}</div>;
              }
              if (method.kind === "password") {
                return (
                  <Password
                    key={method.id}
                    method={method}
                    props={props}
                    errorId={errorId}
                  />
                );
              }
              if (method.kind === "redirect") {
                return (
                  <Button
                    key={method.id}
                    size="lg"
                    type="button"
                    disabled={props.busy}
                    xstyle={styles.action}
                    onClick={() => props.onRedirect(method)}
                  >
                    {method.label}
                  </Button>
                );
              }
              return (
                <p key={method.id}>
                  The application has not installed a renderer for{" "}
                  {method.label}.
                </p>
              );
            })}
          </div>
        )}
        {props.error && (
          <p id={errorId} role="alert" {...stylex.props(styles.error)}>
            {props.error.message}
          </p>
        )}
        <div {...stylex.props(styles.actions)}>
          {props.state !== "loading" && (
            <Button
              size="lg"
              variant="outline"
              disabled={props.busy}
              onClick={props.onRetry}
              xstyle={styles.action}
            >
              Retry session
            </Button>
          )}
          {props.state === "forbidden" && props.onLogout && (
            <Button
              size="lg"
              variant="outline"
              disabled={props.busy}
              onClick={props.onLogout}
              xstyle={styles.action}
            >
              Sign out to switch account
            </Button>
          )}
          {props.busy && props.onCancel && (
            <Button
              size="lg"
              variant="outline"
              onClick={props.onCancel}
              xstyle={styles.action}
            >
              Cancel request
            </Button>
          )}
        </div>
      </main>
    </ConsoleLayout>
  );
}
