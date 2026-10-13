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
    maxWidth: 408,
    minHeight: "100dvh",
    marginInline: "auto",
    paddingInline: 24,
    paddingBlock: 48,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    color: "var(--foreground)",
    overflowWrap: "anywhere",
  },
  heading: {
    width: "fit-content",
    maxWidth: "100%",
    marginInline: "auto",
    marginBlock: 0,
    fontSize: 24,
    fontWeight: 500,
    lineHeight: 1.3,
    letterSpacing: "-0.02em",
    textAlign: "center",
    borderRadius: 6,
    outlineOffset: 6,
  },
  description: {
    marginBlockStart: 12,
    marginBlockEnd: 32,
    fontSize: 14,
    lineHeight: 1.6,
    textAlign: "center",
    color: "color-mix(in oklab, var(--muted) 90%, var(--foreground) 10%)",
  },
  methods: { display: "flex", flexDirection: "column", gap: 32 },
  form: { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 },
  method: {
    marginBlock: 0,
    fontSize: 12,
    lineHeight: 1.5,
    textAlign: "center",
    color: "color-mix(in oklab, var(--muted) 90%, var(--foreground) 10%)",
  },
  label: { display: "flex", flexDirection: "column", gap: 8, fontSize: 14 },
  input: { width: "100%", minWidth: 0, minHeight: 44 },
  action: { minHeight: 44, whiteSpace: "normal" },
  submit: {
    width: "100%",
    marginBlockStart: 4,
    color: "var(--background)",
    // Inverting themes must not tween foreground and background through the same gray.
    transitionProperty: "opacity, box-shadow",
    backgroundColor: {
      default: "var(--background-inverse)",
      ":hover":
        "color-mix(in oklab, var(--background-inverse) 92%, var(--background) 8%)",
    },
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBlockStart: 24,
  },
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
      aria-label={props.methods.length > 1 ? method.label : "Sign in"}
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
      {props.methods.length > 1 && (
        <p {...stylex.props(styles.method)}>{method.label}</p>
      )}
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
        xstyle={[styles.action, styles.submit]}
      >
        {props.busy ? "Signing in…" : "Sign in"}
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
  const showRetry =
    props.state !== "loading" &&
    (!showMethods ||
      props.state === "expired" ||
      props.methods.length === 0 ||
      Boolean(props.error));
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
                    xstyle={[styles.action, styles.submit]}
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
          {showRetry && (
            <Button
              size="lg"
              variant="ghost"
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
