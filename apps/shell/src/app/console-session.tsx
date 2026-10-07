import { Button } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import { TextField } from "@lenso/ui/textfield";
import * as stylex from "@stylexjs/stylex";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { consoleDevConfig } from "../dev/console-dev-config";
import {
  retireWorkspaceSources,
  signOutWorkspaceSources,
} from "../features/extensions/workspace-source-session";
import {
  consoleApiPath,
  consoleAuthPath,
  consoleHttpPaths,
  consoleShellPath,
} from "../lib/console-http-paths";
import { problemMessage } from "../lib/http-problem";
import {
  withIdentityTransition,
  withIdentityRead,
  subscribeIdentityTransitions,
  subscribeWorkspaceIdentityTransitions,
} from "../lib/identity-transition";
import { queryClient } from "../lib/query-client";
import { configureSessionCsrf, sessionFetch } from "../lib/session-fetch";
import { useConsoleLocale, prepareSessionLocale } from "./console-locale";
import { sessionStyles as styles } from "./console-session.stylex";

type LoginMethod = {
  id: string;
  kind: "password" | "redirect";
  label: string;
  action: string;
};
type State =
  | { kind: "loading" | "ready" | "error" | "denied" }
  | { kind: "login"; methods: LoginMethod[] };

const SessionActions = createContext<{
  subject: string;
  administrator: boolean;
  assistantEnabled: boolean;
  managementEnabled: boolean;
  humanManagementEnabled: boolean;
  workspaceIds: string[];
  signOut?: () => Promise<void>;
}>({
  subject: "local",
  administrator: true,
  assistantEnabled: true,
  managementEnabled: false,
  humanManagementEnabled: false,
  workspaceIds: [],
});
export function useConsoleSession() {
  return useContext(SessionActions);
}

// A public build-time setting; API requests still authenticate on every call.
const configuredFreshness = Number(
  import.meta.env.VITE_CONSOLE_SESSION_FRESHNESS_MS
);
const defaultFreshnessMs =
  Number.isFinite(configuredFreshness) && configuredFreshness >= 0
    ? configuredFreshness
    : 60_000;

export function ConsoleSession({
  children,
  freshnessMs = defaultFreshnessMs,
}: {
  children: ReactNode;
  freshnessMs?: number;
}) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const [state, setState] = useState<State>({ kind: "loading" });
  const generation = useRef(0);
  const scope = useRef<string | undefined>(undefined);
  const ready = useRef(false);
  const signingOut = useRef(false);
  const lastSuccess = useRef<number | undefined>(undefined);
  const retryAfter = useRef(0);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const inFlight = useRef<
    { controller: AbortController; promise: Promise<void> } | undefined
  >(undefined);
  const [identity, setIdentity] = useState("local");
  const [sessionSubject, setSessionSubject] = useState("local");
  const [authenticated, setAuthenticated] = useState(false);
  const [access, setAccess] = useState({
    administrator: true,
    assistantEnabled: true,
    managementEnabled: false,
    humanManagementEnabled: false,
    workspaceIds: [] as string[],
  });
  const invalidate = useCallback((preserveLogin = false) => {
    retireWorkspaceSources();
    generation.current += 1;
    inFlight.current?.controller.abort();
    inFlight.current = undefined;
    clearTimeout(retryTimer.current);
    ready.current = false;
    scope.current = undefined;
    lastSuccess.current = undefined;
    failures.current = 0;
    retryAfter.current = 0;
    queryClient.clear();
    setState((current) =>
      preserveLogin && current.kind === "login" ? current : { kind: "loading" }
    );
  }, []);
  const refresh = useCallback(
    (force = true): Promise<void> => {
      if (signingOut.current) {
        return Promise.resolve();
      }
      if (inFlight.current) {
        return inFlight.current.promise;
      }
      const now = Date.now();
      if (
        !force &&
        (now < retryAfter.current ||
          (failures.current === 0 &&
            lastSuccess.current !== undefined &&
            now - lastSuccess.current < freshnessMs))
      ) {
        return Promise.resolve();
      }
      clearTimeout(retryTimer.current);
      const controller = new AbortController();
      const { signal } = controller;
      generation.current += 1;
      const { current } = generation;
      const active = () => current === generation.current && !signal.aborted;
      const read = withIdentityRead(async () => {
        if (!active()) {
          return;
        }
        if (consoleDevConfig.mode === "mock") {
          ready.current = true;
          setState({ kind: "ready" });
          return;
        }
        try {
          // Both are read-only under the same identity lock. Start together,
          // but retire an invalid session before waiting for method discovery.
          const methodsRead = (async () => {
            try {
              const methods = await sessionFetch(consoleAuthPath("methods"), {
                credentials: "same-origin",
                cache: "no-store",
                signal,
              });
              return methods.ok ? await methods.json() : undefined;
            } catch {
              return undefined;
            }
          })();
          const prepareMethods = async () => {
            const configuration: unknown = await methodsRead;
            if (configuration === undefined) {
              throw new Error("Session configuration unavailable");
            }
            if (active()) {
              configureSessionCsrf(configuration);
            }
            return configuration;
          };
          const response = await sessionFetch("/api/console/v1/session", {
            credentials: "same-origin",
            cache: "no-store",
            signal,
          });
          if (!active()) {
            return;
          }
          if (response.status === 401 || response.status === 403) {
            retireWorkspaceSources();
            // Confirmed invalid/denied access retires admitted content before fetching
            // login options. An already-open login form keeps its entered values.
            if (ready.current) {
              setState({ kind: "loading" });
            }
            ready.current = false;
            scope.current = undefined;
            lastSuccess.current = undefined;
            queryClient.clear();
          }
          if (response.status === 403) {
            await prepareMethods();
            if (!active()) {
              return;
            }
            queryClient.clear();
            setState({ kind: "denied" });
          } else if (response.status === 401) {
            const value = await prepareMethods();
            if (!active()) {
              return;
            }
            await prepareSessionLocale("anonymous", signal);
            if (!active()) {
              return;
            }
            const methods = parseLoginMethods(value);
            if (methods.length === 0) {
              throw new Error("No login methods");
            }
            queryClient.clear();
            setState({ kind: "login", methods });
          } else {
            if (!response.ok) {
              throw new Error("Session unavailable");
            }
            const value: unknown = await response.json();
            if (
              !value ||
              typeof value !== "object" ||
              !("mode" in value) ||
              !(
                value.mode === "local" ||
                (value.mode === "required" &&
                  "authenticated" in value &&
                  value.authenticated === true &&
                  "subject" in value &&
                  typeof value.subject === "string" &&
                  value.subject.length > 0)
              )
            ) {
              throw new Error("Invalid session");
            }
            const nextSubject =
              value.mode === "required" && "subject" in value
                ? String(value.subject)
                : "local";
            const nextAccess = {
              assistantEnabled:
                "assistant_enabled" in value &&
                value.assistant_enabled === true,
              humanManagementEnabled:
                "human_management_enabled" in value &&
                value.human_management_enabled === true,
              managementEnabled:
                "management_enabled" in value &&
                value.management_enabled === true,
              administrator:
                value.mode === "local" ||
                ("administrator" in value && value.administrator === true),
              workspaceIds:
                "workspace_ids" in value && Array.isArray(value.workspace_ids)
                  ? [
                      ...new Set(
                        value.workspace_ids.filter(
                          (id): id is string => typeof id === "string"
                        )
                      ),
                    ].sort()
                  : [],
            };
            const nextScope = JSON.stringify([
              value.mode,
              nextSubject,
              nextAccess,
              response.headers.get("x-lenso-read-scope"),
            ]);
            if (ready.current && scope.current !== nextScope) {
              retireWorkspaceSources();
              ready.current = false;
              scope.current = undefined;
              lastSuccess.current = undefined;
              queryClient.clear();
              setState({ kind: "loading" });
            }
            if (value.mode === "required") {
              await prepareMethods();
              if (!active()) {
                return;
              }
            }
            await prepareSessionLocale(nextScope, signal);
            if (active()) {
              queryClient.admitReadScope(
                response.headers.get("x-lenso-read-scope")
              );
              if (scope.current !== nextScope) {
                queryClient.clear();
                scope.current = nextScope;
                // Remount private consumers on permission changes as well as subject changes.
                setIdentity(nextScope);
                setSessionSubject(nextSubject);
              }
              setAccess(nextAccess);
              ready.current = true;
              lastSuccess.current = Date.now();
              failures.current = 0;
              retryAfter.current = 0;
              setAuthenticated(value.mode === "required");
              setState({ kind: "ready" });
            }
          }
        } catch {
          if (active()) {
            if (ready.current) {
              failures.current += 1;
              const delay = Math.min(
                30_000,
                1000 * 2 ** (failures.current - 1)
              );
              retryAfter.current = Date.now() + delay;
              // Keep an admitted page usable through temporary failures. Stop automatic
              // retries after three; a later focus may try again after the backoff.
              if (failures.current <= 3) {
                retryTimer.current = setTimeout(() => {
                  if (active()) {
                    void refresh(false);
                  }
                }, delay);
              }
            } else {
              setState({ kind: "error" });
            }
          }
        }
      }, signal);
      const promise = (async () => {
        try {
          await read;
        } catch {
          if (active()) {
            setState({ kind: "error" });
          }
        }
      })();
      const pending = { controller, promise };
      inFlight.current = pending;
      void (async () => {
        try {
          await promise;
        } finally {
          if (inFlight.current === pending) {
            inFlight.current = undefined;
          }
        }
      })();
      return promise;
    },
    [freshnessMs]
  );
  useEffect(() => {
    void refresh();
    const focus = () => {
      void refresh(false);
    };
    const expired = () => {
      if (ready.current) {
        invalidate();
      }
      void refresh();
    };
    const unsubscribe = subscribeIdentityTransitions((phase) => {
      invalidate(true);
      if (phase === "complete") {
        void refresh();
      }
    });
    const unsubscribeWorkspace = consoleHttpPaths.workspace_sources?.length
      ? undefined
      : subscribeWorkspaceIdentityTransitions((phase) => {
          invalidate(true);
          if (phase === "complete") {
            void refresh();
          }
        });
    window.addEventListener("focus", focus);
    window.addEventListener("lenso-session-expired", expired);
    return () => {
      generation.current += 1;
      inFlight.current?.controller.abort();
      inFlight.current = undefined;
      clearTimeout(retryTimer.current);
      unsubscribe();
      unsubscribeWorkspace?.();
      window.removeEventListener("focus", focus);
      window.removeEventListener("lenso-session-expired", expired);
    };
  }, [invalidate, refresh]);
  const signOut = useCallback(async () => {
    if (signingOut.current) {
      return;
    }
    signingOut.current = true;
    invalidate();
    let completed = false;
    try {
      completed = await withIdentityTransition(async () => {
        await signOutWorkspaceSources(consoleHttpPaths.workspace_sources ?? []);
        const response = await sessionFetch(consoleAuthPath("logout"), {
          method: "POST",
          credentials: "same-origin",
        });
        await response.arrayBuffer();
        return response.ok;
      });
    } catch {
      completed = false;
    } finally {
      signingOut.current = false;
    }
    if (completed) {
      await refresh();
    } else {
      setState({ kind: "error" });
    }
  }, [invalidate, refresh]);
  if (state.kind === "ready") {
    return (
      <SessionActions
        key={identity}
        value={
          authenticated
            ? {
                ...access,
                subject: sessionSubject,
                signOut,
              }
            : {
                subject: "local",
                assistantEnabled: access.assistantEnabled,
                administrator: true,
                managementEnabled: false,
                humanManagementEnabled: false,
                workspaceIds: [],
              }
        }
      >
        {children}
      </SessionActions>
    );
  }
  return (
    <main {...stylex.props(styles.root)}>
      <section {...stylex.props(styles.panel)}>
        <header {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.brand)}>
            <img
              src={consoleShellPath("/favicon.svg")}
              alt=""
              width={36}
              height={36}
              {...stylex.props(styles.logo)}
            />
          </div>
          <h1 {...stylex.props(styles.title)}>
            {zh ? "登录 Lenso" : "Log in to Lenso"}
          </h1>
        </header>
        {state.kind === "loading" && (
          <output {...stylex.props(styles.muted)}>
            {zh ? "正在检查会话…" : "Checking your session…"}
          </output>
        )}
        {state.kind === "denied" && (
          <>
            <p role="alert" {...stylex.props(styles.error)}>
              {zh
                ? "当前账号没有此 Console 的访问权限，请联系管理员。"
                : "Your account does not have access to this Console. Contact your administrator."}
            </p>
            <Button onClick={signOut}>{zh ? "退出登录" : "Sign out"}</Button>
          </>
        )}
        {state.kind === "error" && (
          <>
            <p role="alert" {...stylex.props(styles.error)}>
              {zh
                ? "暂时无法连接认证服务。"
                : "The authentication service is unavailable."}
            </p>
            <Button
              onClick={() => {
                void refresh();
              }}
            >
              {zh ? "重试" : "Try again"}
            </Button>
          </>
        )}
        {state.kind === "login" && (
          <LoginMethods
            methods={state.methods}
            onSignedIn={() => {
              invalidate();
              return refresh();
            }}
            zh={zh}
          />
        )}
      </section>
    </main>
  );
}

function LoginMethods({
  methods,
  onSignedIn,
  zh,
}: {
  methods: LoginMethod[];
  onSignedIn: () => Promise<void>;
  zh: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div {...stylex.props(styles.methods)}>
      {[
        ...methods.filter((method) => method.kind === "redirect"),
        ...methods.filter((method) => method.kind === "password"),
      ].map((method) =>
        method.kind === "redirect" ? (
          <Button
            key={method.id}
            xstyle={styles.action}
            disabled={busy}
            onClick={() => {
              const url = new URL(method.action, window.location.origin);
              url.searchParams.set(
                "return_to",
                `${window.location.pathname}${window.location.search}`
              );
              setBusy(true);
              setError("");
              void (async () => {
                try {
                  await withIdentityTransition(async () => {
                    await signOutWorkspaceSources(
                      consoleHttpPaths.workspace_sources ?? []
                    );
                    window.location.assign(url.href);
                  });
                } catch {
                  setBusy(false);
                  setError(
                    zh
                      ? "无法退出工作区，请重试。"
                      : "Unable to sign out of workspaces. Try again."
                  );
                }
              })();
            }}
          >
            {zh && method.id === "sso" ? "通过企业 SSO 登录" : method.label}
          </Button>
        ) : (
          <form
            key={method.id}
            {...stylex.props(styles.methods)}
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) {
                return;
              }
              const form = event.currentTarget;
              const values = new FormData(form);
              setBusy(true);
              setError("");
              void (async () => {
                try {
                  const signedIn = await withIdentityTransition(async () => {
                    await signOutWorkspaceSources(
                      consoleHttpPaths.workspace_sources ?? []
                    );
                    const response = await sessionFetch(method.action, {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        identifier: values.get("identifier"),
                        password: values.get("password"),
                      }),
                    });
                    form.reset();
                    if (!response.ok) {
                      setError(
                        await problemMessage(
                          response,
                          response.status === 429
                            ? zh
                              ? "尝试次数过多，请稍后重试。"
                              : "Too many attempts. Try again later."
                            : zh
                              ? "无法登录，请检查账户信息。"
                              : "Unable to sign in. Check your credentials."
                        )
                      );
                      return;
                    }
                    await response.arrayBuffer();
                    const session = await fetch(
                      consoleApiPath("/api/console/v1/session"),
                      {
                        credentials: "same-origin",
                        cache: "no-store",
                      }
                    );
                    if (session.status === 401) {
                      setError(
                        zh
                          ? "登录成功，但浏览器未建立会话。请确认允许 Cookie；本地 HTTP 预览请改用 HTTPS。"
                          : "Sign-in succeeded, but the browser did not establish a session. Check that cookies are allowed; use HTTPS for local previews."
                      );
                      return;
                    }
                    if (!session.ok && session.status !== 403) {
                      setError(
                        await problemMessage(
                          session,
                          zh
                            ? "暂时无法确认登录状态，请重试。"
                            : "Unable to verify your session. Try again."
                        )
                      );
                      return;
                    }
                    await session.arrayBuffer();
                    return true;
                  });
                  if (signedIn) {
                    await onSignedIn();
                  }
                } catch {
                  setError(
                    zh ? "连接失败，请重试。" : "Connection failed. Try again."
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {methods.some((entry) => entry.kind === "redirect") && (
              <div {...stylex.props(styles.divider)}>
                {zh ? "或使用邮箱登录" : "or sign in with email"}
              </div>
            )}
            <div {...stylex.props(styles.field)}>
              <label
                {...stylex.props(styles.label)}
                htmlFor="console-login-email"
              >
                {zh ? "邮箱" : "Email"}
              </label>
              <TextField.Root xstyle={styles.input}>
                <Input
                  placeholder={zh ? "邮箱地址" : "Email address"}
                  id="console-login-email"
                  name="identifier"
                  type="email"
                  autoComplete="username"
                  required
                  disabled={busy}
                />
              </TextField.Root>
            </div>
            <div {...stylex.props(styles.field)}>
              <label
                {...stylex.props(styles.label)}
                htmlFor="console-login-password"
              >
                {zh ? "密码" : "Password"}
              </label>
              <TextField.Root xstyle={styles.input}>
                <Input
                  placeholder={zh ? "密码" : "Password"}
                  id="console-login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={busy}
                />
              </TextField.Root>
            </div>
            <Button
              xstyle={[styles.action, styles.submit]}
              type="submit"
              variant="primary"
              disabled={busy}
            >
              {busy
                ? zh
                  ? "正在登录…"
                  : "Signing in…"
                : zh
                  ? "登录"
                  : "Sign in"}
            </Button>
            {error && (
              <p role="alert" {...stylex.props(styles.error)}>
                {error}
              </p>
            )}
          </form>
        )
      )}
    </div>
  );
}

export function parseLoginMethods(
  value: unknown,
  authBasePath = consoleHttpPaths.auth_base_path
): LoginMethod[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("methods" in value) ||
    !Array.isArray(value.methods)
  ) {
    return [];
  }
  const ids = new Set<string>();
  return value.methods.filter((method): method is LoginMethod => {
    if (
      !method ||
      typeof method !== "object" ||
      typeof method.id !== "string" ||
      typeof method.label !== "string" ||
      typeof method.action !== "string" ||
      !(method.kind === "password" || method.kind === "redirect") ||
      ids.has(method.id)
    ) {
      return false;
    }
    const [actionPath = ""] = method.action.split("?");
    if (
      !(
        actionPath === authBasePath || actionPath.startsWith(`${authBasePath}/`)
      ) ||
      method.action.includes("\\") ||
      /[\s#]/u.test(method.action)
    ) {
      return false;
    }
    const url = new URL(method.action, "https://console.invalid");
    if (
      url.origin !== "https://console.invalid" ||
      url.pathname.includes("%") ||
      url.pathname.includes("//") ||
      !(
        url.pathname === authBasePath ||
        url.pathname.startsWith(`${authBasePath}/`)
      )
    ) {
      return false;
    }
    ids.add(method.id);
    return true;
  });
}
