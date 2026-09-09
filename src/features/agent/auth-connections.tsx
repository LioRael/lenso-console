import { Button } from "@lenso/ui/button";
import { SettingsRow } from "@lenso/ui/settings-row";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { SettingsSection } from "../../components/lenso/recipes/settings-section";
import { settingsPageStyles as preferences } from "../settings/settings-page.stylex";
import { agentApiUrl } from "./agent-runtime";

// HTTP management projection; credentials never cross this boundary.
type Connection = {
  provider: string;
  status: { label: string; connected: boolean; methods: string[] };
};
type Catalog = { generation: string; connections: Connection[] };
type Attempt = {
  attempt_id: string;
  authorization_url: string;
  user_code: string;
  expires_at_millis: string;
};

async function request<T>(
  agentId: string,
  signal: AbortSignal,
  body?: unknown
): Promise<T> {
  const response = await fetch(
    agentApiUrl(agentId, `auth/connections${body ? "/actions" : ""}`),
    {
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: body ? "POST" : "GET",
      signal,
    }
  );
  if (!response.ok) {
    throw new Error(
      "Authentication settings are unavailable. Refresh and try again."
    );
  }
  return response.json() as Promise<T>;
}

function loginUrl(value: string, method?: string): string {
  const url = new URL(value);
  const localConsent =
    method === "browser_consent" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localConsent) ||
    url.username ||
    url.password
  ) {
    throw new Error("The provider returned an unsupported sign-in address.");
  }
  return url.href;
}

export function AuthConnections({ agentId }: { agentId: string }) {
  const t = useConsoleTranslation();

  const catalog = useQuery({
    queryKey: ["agent-auth-connections", agentId],
    queryFn: ({ signal }) => request<Catalog>(agentId, signal),
    retry: false,
  });
  const { refetch } = catalog;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  return (
    <SettingsSection.Root xstyle={preferences.section}>
      <div {...stylex.props(styles.heading)}>
        <SettingsSection.Title xstyle={preferences.sectionTitle}>
          Connected accounts
        </SettingsSection.Title>
        <Button disabled={catalog.isFetching} onClick={refresh}>
          Refresh
        </Button>
      </div>
      {catalog.isPending ? (
        <p {...stylex.props(styles.message)}>{t("Loading accounts…")}</p>
      ) : null}
      {catalog.isError ? (
        <div {...stylex.props(styles.message)}>
          <p role="alert">{t("Could not load accounts.")}</p>
          <Button onClick={() => catalog.refetch()}>Retry</Button>
        </div>
      ) : null}
      {catalog.data ? (
        <SettingsSection.Group xstyle={preferences.group}>
          {catalog.data.connections.length === 0 ? (
            <p {...stylex.props(styles.message)}>
              This Agent has no account connections to manage.
            </p>
          ) : null}
          {catalog.data.connections.map((connection) => (
            <ConnectionRow
              agentId={agentId}
              connection={connection}
              generation={catalog.data.generation}
              key={`${catalog.data.generation}/${connection.provider}`}
              refresh={refresh}
            />
          ))}
        </SettingsSection.Group>
      ) : null}
    </SettingsSection.Root>
  );
}

function isBusinessConnection(connection: Connection) {
  return connection.status.methods.includes("browser_consent");
}
function connectionDescription(connection: Connection) {
  if (isBusinessConnection(connection)) {
    return connection.status.connected
      ? "Connected for this Agent run. Restarting requires a new connection."
      : "Connect to use this App within your existing permissions.";
  }
  return connection.status.connected
    ? "Account saved on this Agent’s Host."
    : "Not connected";
}
function disconnectDescription(connection: Connection) {
  return isBusinessConnection(connection)
    ? "Disconnect this App for new turns? Existing turns keep their identity. Revoke access in the App to stop them."
    : "Remove the account saved on this Host? This does not revoke access at the provider.";
}
function supportedLoginMethods(connection: Connection) {
  return connection.status.methods.filter(
    (method) =>
      method === "device_code" ||
      method === "browser_consent" ||
      (method === "browser_loopback" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))
  );
}

function ConnectionRow({
  agentId,
  connection,
  generation,
  refresh,
}: {
  agentId: string;
  connection: Connection;
  generation: string;
  refresh: () => void;
}) {
  const t = useConsoleTranslation();

  const methods = supportedLoginMethods(connection);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const action = <T,>(kind: string, payload: unknown, signal: AbortSignal) =>
    request<T>(agentId, signal, {
      generation,
      provider: connection.provider,
      action: { kind, request: payload },
    });

  useEffect(() => {
    if (!attempt) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (Date.now() >= Number(attempt.expires_at_millis)) {
          setAttempt(null);
          setMessage("Sign-in expired. You can start again.");
          return;
        }
        const result = await request<{ state: string }>(
          agentId,
          controller.signal,
          {
            generation,
            provider: connection.provider,
            action: {
              kind: "poll",
              request: { attempt_id: attempt.attempt_id },
            },
          }
        );
        if (controller.signal.aborted) {
          return;
        }
        if (result.state === "pending") {
          timer = setTimeout(poll, 2000);
          return;
        }
        setAttempt(null);
        setMessage(
          result.state === "connected"
            ? "Account connected."
            : "Sign-in ended. You can try again."
        );
        refresh();
      } catch {
        if (!controller.signal.aborted) {
          setMessage(
            "Could not check sign-in. Cancel to try again, or refresh accounts."
          );
        }
      }
    };
    timer = setTimeout(poll, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [agentId, attempt, connection.provider, generation, refresh]);

  async function perform(
    kind: "begin" | "cancel" | "disconnect",
    method?: string
  ) {
    const controller = lifetime.current;
    if (lock.current || !controller || controller.signal.aborted) {
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    const loginWindow =
      kind === "begin" &&
      (method === "browser_loopback" || method === "browser_consent")
        ? window.open("about:blank", "_blank")
        : null;
    if (loginWindow) {
      loginWindow.opener = null;
    }
    try {
      if (kind === "begin") {
        const result = await action<Attempt>(
          kind,
          { method },
          controller.signal
        );
        if (controller.signal.aborted) {
          loginWindow?.close();
          return;
        }
        result.authorization_url = loginUrl(result.authorization_url, method);
        if (
          !result.attempt_id ||
          !Number.isFinite(Number(result.expires_at_millis))
        ) {
          throw new Error("Invalid sign-in response.");
        }
        setAttempt(result);
        if (loginWindow) {
          loginWindow.location.replace(result.authorization_url);
        }
      } else {
        await action(
          kind,
          kind === "cancel" ? { attempt_id: attempt?.attempt_id } : {},
          controller.signal
        );
        if (controller.signal.aborted) {
          return;
        }
        setAttempt(null);
        setConfirm(false);
        refresh();
      }
    } catch {
      loginWindow?.close();
      if (!controller.signal.aborted) {
        setMessage(
          method === "browser_loopback"
            ? "Browser sign-in could not start. Close another pending sign-in or use Sign in with code."
            : "Could not complete this action. Another sign-in may be pending, or settings may have changed. Refresh accounts before retrying."
        );
      }
    } finally {
      lock.current = false;
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  return (
    <div {...stylex.props(styles.connection)}>
      <SettingsRow.Root xstyle={preferences.row}>
        <SettingsRow.Copy>
          <SettingsRow.Title xstyle={preferences.rowTitle}>
            {connection.status.label}
          </SettingsRow.Title>
          <SettingsRow.Description xstyle={preferences.rowDescription}>
            {t(connectionDescription(connection))}
          </SettingsRow.Description>
        </SettingsRow.Copy>
        <SettingsRow.Control xstyle={styles.control}>
          {attempt ? (
            <Button disabled={busy} onClick={() => perform("cancel")}>
              {t("Cancel sign-in")}
            </Button>
          ) : connection.status.connected ? (
            <Button disabled={busy} onClick={() => setConfirm(!confirm)}>
              {t("Disconnect…")}
            </Button>
          ) : (
            <div {...stylex.props(styles.actions)}>
              {methods.map((method) => (
                <Button
                  disabled={busy}
                  key={method}
                  onClick={() => perform("begin", method)}
                >
                  {busy
                    ? t("Starting…")
                    : method === "device_code"
                      ? t("Sign in with code")
                      : t("Sign in with browser")}
                </Button>
              ))}
            </div>
          )}
        </SettingsRow.Control>
      </SettingsRow.Root>
      {confirm ? (
        <div {...stylex.props(styles.message)}>
          <p>{t(disconnectDescription(connection))}</p>
          <div {...stylex.props(styles.actions)}>
            <Button disabled={busy} onClick={() => perform("disconnect")}>
              {t("Disconnect account")}
            </Button>
            <Button disabled={busy} onClick={() => setConfirm(false)}>
              {t("Keep connected")}
            </Button>
          </div>
        </div>
      ) : null}
      {attempt ? (
        <div {...stylex.props(styles.message)}>
          <p>
            {t("Open the provider’s sign-in page")}
            {attempt.user_code ? t(" and enter this code:") : "."}
          </p>
          {attempt.user_code ? (
            <code {...stylex.props(styles.code)}>{attempt.user_code}</code>
          ) : null}
          <a
            href={attempt.authorization_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("Continue sign-in ↗")}
          </a>
          <p>{t("Waiting for sign-in… Keep this page open.")}</p>
        </div>
      ) : null}
      {message ? (
        <output {...stylex.props(styles.message)}>{t(message)}</output>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  connection: { width: "100%", minWidth: 0 },
  control: {
    marginInlineStart: "auto",
    flexShrink: 0,
    justifyContent: "flex-end",
  },
  heading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: "16px",
    gap: "12px",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: "8px" },
  code: {
    display: "block",
    fontSize: "20px",
    letterSpacing: "0.12em",
    marginBlock: "12px",
    userSelect: "all",
  },
  message: {
    color: "var(--color-content-secondary)",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "12px 16px",
  },
});
