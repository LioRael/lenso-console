import { Button } from "@lenso/ui/button";
import { TextField } from "@lenso/ui/text-field";
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
import { problemMessage } from "../lib/http-problem";
import { queryClient } from "../lib/query-client";
import { configureSessionCsrf, sessionFetch } from "../lib/session-fetch";
import { useConsoleLocale } from "./console-locale";
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
  administrator: boolean;
  workspaceIds: string[];
  signOut?: () => Promise<void>;
}>({ administrator: true, workspaceIds: [] });
export function useConsoleSession() {
  return useContext(SessionActions);
}

export function ConsoleSession({ children }: { children: ReactNode }) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const [state, setState] = useState<State>({ kind: "loading" });
  const generation = useRef(0);
  const subject = useRef<string | undefined>(undefined);
  const [identity, setIdentity] = useState("local");
  const [authenticated, setAuthenticated] = useState(false);
  const [access, setAccess] = useState({
    administrator: true,
    workspaceIds: [] as string[],
  });
  const refresh = useCallback(async (signal?: AbortSignal) => {
    generation.current += 1;
    const { current } = generation;
    const active = () => current === generation.current && !signal?.aborted;
    if (consoleDevConfig.mode === "mock") {
      setState({ kind: "ready" });
      return;
    }
    try {
      const response = await sessionFetch("/api/console/v1/session", {
        credentials: "same-origin",
        cache: "no-store",
        signal: signal ?? null,
      });
      if (response.status === 403) {
        const methods = await sessionFetch("/auth/methods", {
          cache: "no-store",
          signal: signal ?? null,
        });
        if (!methods.ok) {
          throw new Error("Session configuration unavailable");
        }
        const configuration: unknown = await methods.json();
        if (!active()) {
          return;
        }
        configureSessionCsrf(configuration);
        queryClient.clear();
        setState({ kind: "denied" });
      } else if (response.status === 401) {
        const methodsResponse = await sessionFetch("/auth/methods", {
          credentials: "same-origin",
          cache: "no-store",
          signal: signal ?? null,
        });
        if (!methodsResponse.ok) {
          throw new Error("Methods unavailable");
        }
        const value: unknown = await methodsResponse.json();
        if (!active()) {
          return;
        }
        configureSessionCsrf(value);
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
        if (value.mode === "required") {
          const methods = await sessionFetch("/auth/methods", {
            credentials: "same-origin",
            cache: "no-store",
            signal: signal ?? null,
          });
          if (!methods.ok) {
            throw new Error("Session configuration unavailable");
          }
          const configuration: unknown = await methods.json();
          if (!active()) {
            return;
          }
          configureSessionCsrf(configuration);
        }
        if (active()) {
          const nextSubject =
            value.mode === "required" && "subject" in value
              ? String(value.subject)
              : "local";
          if (subject.current !== nextSubject) {
            queryClient.clear();
            subject.current = nextSubject;
            setIdentity(nextSubject);
          }
          setAccess({
            administrator:
              value.mode === "local" ||
              ("administrator" in value && value.administrator === true),
            workspaceIds:
              "workspace_ids" in value && Array.isArray(value.workspace_ids)
                ? value.workspace_ids.filter(
                    (id): id is string => typeof id === "string"
                  )
                : [],
          });
          setAuthenticated(value.mode === "required");
          setState({ kind: "ready" });
        }
      }
    } catch {
      if (active()) {
        setState({ kind: "error" });
      }
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const focus = () => {
      void refresh(controller.signal);
    };
    window.addEventListener("focus", focus);
    window.addEventListener("lenso-session-expired", focus);
    return () => {
      generation.current += 1;
      controller.abort();
      window.removeEventListener("focus", focus);
      window.removeEventListener("lenso-session-expired", focus);
    };
  }, [refresh]);
  if (state.kind === "ready") {
    return (
      <SessionActions
        key={identity}
        value={
          authenticated
            ? {
                ...access,
                signOut: async () => {
                  const response = await sessionFetch("/auth/logout", {
                    method: "POST",
                    credentials: "same-origin",
                  });
                  if (response.ok) {
                    queryClient.clear();
                    setState({ kind: "loading" });
                    await refresh();
                  } else {
                    setState({ kind: "error" });
                  }
                },
              }
            : { administrator: true, workspaceIds: [] }
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
              src="/favicon.svg"
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
            <Button
              onClick={async () => {
                const response = await sessionFetch("/auth/logout", {
                  method: "POST",
                  credentials: "same-origin",
                });
                if (response.ok) {
                  await refresh();
                } else {
                  setState({ kind: "error" });
                }
              }}
            >
              {zh ? "退出登录" : "Sign out"}
            </Button>
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
            onSignedIn={() => refresh()}
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
              window.location.assign(url.href);
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
                  const session = await fetch("/api/console/v1/session", {
                    credentials: "same-origin",
                    cache: "no-store",
                  });
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
                  await onSignedIn();
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
                <TextField.Control
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
                <TextField.Control
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

export function parseLoginMethods(value: unknown): LoginMethod[] {
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
    if (
      !method.action.startsWith("/auth/") ||
      method.action.includes("\\") ||
      /[\s#]/u.test(method.action)
    ) {
      return false;
    }
    const url = new URL(method.action, "https://console.invalid");
    if (
      url.origin !== "https://console.invalid" ||
      !url.pathname.startsWith("/auth/")
    ) {
      return false;
    }
    ids.add(method.id);
    return true;
  });
}
