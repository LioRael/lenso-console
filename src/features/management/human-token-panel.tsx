import { Button } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import { TextField } from "@lenso/ui/textfield";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { useConsoleLocale } from "../../app/console-locale";
import { useConsoleSession } from "../../app/console-session";
import { sessionFetch } from "../../lib/session-fetch";
import { settingsPageStyles as page } from "../settings/settings-page.stylex";
import {
  decodeIssueResponse,
  decodeListResponse,
  decodeRevokeResponse,
  decodeReceiptResponse,
  type CredentialMetadata,
  type IssueRequest,
  type ResourceScope,
  type Timestamp,
} from "./generated/human-api-token";

const styles = stylex.create({
  panel: { display: "grid", gap: 16, padding: 16, marginTop: 32 },
  field: { display: "grid", gap: 8, fontSize: 13 },
  list: { display: "grid", gap: 12, paddingLeft: 20 },
  row: { display: "grid", gap: 8, overflowWrap: "anywhere" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
});
export function HumanTokenPanel({ deployment }: { deployment: string }) {
  const { locale } = useConsoleLocale();
  const { subject } = useConsoleSession();
  const storageKey = `lenso-pat-receipt:v1:${encodeURIComponent(subject)}:${encodeURIComponent(deployment)}`;
  const [receiptKey, setReceiptKey] = useState<string>();
  const [storageReady, setStorageReady] = useState(false);
  const copy = (en: string, cn: string) => (locale === "zh-CN" ? cn : en);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [permissions, setPermissions] = useState("");
  const [scopes, setScopes] = useState("[]");
  const [intent, setIntent] = useState<IssueRequest>();
  const [unknown, setUnknown] = useState(Boolean(receiptKey));
  const [secret, setSecret] = useState<string>();
  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    try {
      const retained = localStorage.getItem(storageKey) ?? undefined;
      setReceiptKey(retained);
      setUnknown(Boolean(retained));
      setStorageReady(true);
    } catch {
      setStorageReady(false);
    }
  }, [storageKey]);

  const clearReceipt = async (expected: string | undefined, held = false) => {
    const compareAndClear = () => {
      const retained = localStorage.getItem(storageKey);
      if (retained && retained !== expected) {
        setReceiptKey(retained);
        setUnknown(true);
        setMessage(
          copy(
            "Another request reference must be reconciled before preparing a token.",
            "须先核对另一个请求引用，才能准备令牌。"
          )
        );
        return false;
      }
      if (retained === expected) {
        localStorage.removeItem(storageKey);
      }
      return true;
    };
    return held
      ? compareAndClear()
      : navigator.locks.request(storageKey, compareAndClear);
  };
  const prepareAnother = async () => {
    setSecret(undefined);
    try {
      if (await clearReceipt(receiptKey)) {
        setIntent(undefined);
        setReceiptKey(undefined);
        setUnknown(false);
        setMessage("");
      }
    } catch {
      setUnknown(true);
    }
  };
  const perform = async (
    operation: "issue" | "list" | "receipt" | "revoke",
    credentialId?: string
  ) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setSecret(undefined);
    setBusy(true);
    setMessage("");
    let submitted = false;
    let ownKey = receiptKey;
    try {
      let body: unknown;
      if (operation === "issue") {
        if (receiptKey || intent) {
          return;
        }
        const resourceScopes = JSON.parse(scopes) as ResourceScope[];
        if (!Array.isArray(resourceScopes)) {
          throw new TypeError("invalid");
        }
        const input: IssueRequest = {
          deployment,
          name,
          expires_at: new Date(expiry).toISOString() as Timestamp,
          permissions: permissions
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          resource_scopes: resourceScopes,
          idempotency_key: crypto.randomUUID(),
        };
        validateIssue(input);
        localStorage.setItem(storageKey, input.idempotency_key);
        ownKey = input.idempotency_key;
        setReceiptKey(input.idempotency_key);
        setIntent(input);
        body = input;
      } else if (operation === "receipt") {
        if (!receiptKey) {
          return;
        }
        body = { deployment, idempotency_key: receiptKey };
      } else if (operation === "list") {
        body = { deployment, limit: 100 };
      } else {
        body = { deployment, credential_id: credentialId };
      }
      submitted = true;
      const response = await sessionFetch(
        `/api/console/v1/human-tokens/${operation}`,
        {
          method: "POST",
          signal: request.signal,
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Lenso-Expected-Subject": subject,
          },
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        throw new Error(
          response.status === 400 || response.status === 403
            ? "denied"
            : "unknown"
        );
      }
      const text = await response.text();
      if (request.signal.aborted) {
        return;
      }
      if (operation === "issue") {
        const result = decodeIssueResponse(text);
        if (!(await clearReceipt(ownKey, true))) {
          return;
        }
        setSecret(result.token ?? undefined);
        setUnknown(false);
        setMessage(
          result.token
            ? copy(
                "Copy this token now. It is returned once and is cleared by the next action.",
                "请立即复制令牌。秘密只返回一次，下次操作会清除显示。"
              )
            : copy(
                "The owner recorded this request. Its secret cannot be recovered or issued again.",
                "Owner 已记录此请求；秘密无法恢复，也不会再次签发。"
              )
        );
      } else if (operation === "receipt") {
        const receipt = decodeReceiptResponse(text);
        if (receipt.found && receipt.credential) {
          if (!(await clearReceipt(ownKey))) {
            return;
          }
          setCredentials((current) => [
            receipt.credential!,
            ...current.filter(
              (credential) =>
                credential.credential_id !== receipt.credential!.credential_id
            ),
          ]);
          setUnknown(false);
          setMessage(
            copy(
              "The owner confirms issuance. The one-time secret cannot be recovered; revoke this credential if you did not receive it.",
              "Owner 已确认签发。一次性秘密无法恢复；若未收到秘密，请撤销此凭据。"
            )
          );
        } else {
          setUnknown(true);
          setMessage(
            copy(
              "No committed receipt is visible yet. The original operation may still be running; keep querying this request.",
              "尚未找到已提交回执；原操作可能仍在执行，请继续查询此请求。"
            )
          );
        }
      } else if (operation === "list") {
        setCredentials(decodeListResponse(text).credentials);
      } else {
        decodeRevokeResponse(text);
        setCredentials((current) =>
          current.filter(
            (credential) => credential.credential_id !== credentialId
          )
        );
        setMessage(
          copy("The owner recorded the revocation.", "Owner 已记录撤销。")
        );
      }
    } catch (error) {
      if (!request.signal.aborted) {
        const uncertain =
          submitted &&
          (operation === "issue" ||
            (error instanceof Error && error.message !== "denied"));
        if (operation === "issue") {
          setUnknown(uncertain);
        }
        setMessage(
          uncertain
            ? copy(
                "The owner result is unknown. Keep the original request ID and query its receipt; do not issue another token.",
                "Owner 结果未知。请保留原请求 ID 并查询回执，不要再次签发。"
              )
            : copy(
                "The current account or requested scope was rejected. Check the deployment, expiry and admitted permissions.",
                "当前账号或请求范围被拒绝，请检查部署、有效期与允许的权限。"
              )
        );
      }
    } finally {
      if (!request.signal.aborted) {
        setBusy(false);
      }
    }
  };
  const submit = async () => {
    if (!navigator.locks || !storageReady) {
      setMessage(
        copy(
          "This browser cannot safely coordinate token issuance. Use a secure browser context.",
          "当前浏览器无法安全协调令牌签发，请使用安全的浏览器环境。"
        )
      );
      return;
    }
    try {
      await navigator.locks.request(storageKey, async () => {
        const retained = localStorage.getItem(storageKey);
        if (retained) {
          setReceiptKey(retained);
          setUnknown(true);
          return;
        }
        await perform("issue");
      });
    } catch {
      setMessage(
        copy(
          "Unable to retain the receipt reference. Issuance was not started.",
          "无法保留回执引用，未开始签发。"
        )
      );
    }
  };
  return (
    <section
      {...stylex.props(styles.panel, page.group)}
      aria-label={copy("Personal API tokens", "个人 API 令牌")}
    >
      <h2 {...stylex.props(page.sectionTitle)}>
        {copy("Personal API tokens", "个人 API 令牌")}
      </h2>
      <p {...stylex.props(page.description)}>
        {copy(
          "Choose explicit permissions and resource scopes admitted by this deployment. The server intersects them with your current membership and grants.",
          "选择此部署允许的具体权限和资源范围；服务端会与当前成员资格、授权及会话上限求交。"
        )}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {(
          [
            ["Name", "名称", name, setName],
            ["Expiry (RFC3339)", "有效期（RFC3339）", expiry, setExpiry],
            [
              "Permissions (comma separated)",
              "权限（逗号分隔）",
              permissions,
              setPermissions,
            ],
            ["Resource scopes (JSON)", "资源范围（JSON）", scopes, setScopes],
          ] as const
        ).map(([en, cn, value, change]) => (
          <label key={en} {...stylex.props(styles.field)}>
            {copy(en, cn)}
            <TextField.Root>
              <Input
                value={value}
                maxLength={8192}
                disabled={busy || !storageReady || Boolean(receiptKey)}
                onChange={(event) => change(event.target.value)}
              />
            </TextField.Root>
          </label>
        ))}
        <Button
          type="submit"
          disabled={busy || !storageReady || Boolean(receiptKey)}
        >
          {copy("Issue personal token", "签发个人令牌")}
        </Button>
      </form>
      {receiptKey && (
        <p>
          {copy("Request ID", "请求 ID")}: {receiptKey}
        </p>
      )}
      {secret && (
        <label {...stylex.props(styles.field)}>
          {copy("One-time token", "一次性令牌")}
          <TextField.Root>
            <Input value={secret} readOnly autoComplete="off" />
          </TextField.Root>
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(secret);
            }}
          >
            {copy("Copy token", "复制令牌")}
          </Button>
          <Button variant="ghost" onClick={() => setSecret(undefined)}>
            {copy("Hide token", "隐藏令牌")}
          </Button>
        </label>
      )}
      <div {...stylex.props(styles.actions)}>
        {receiptKey && (
          <Button
            disabled={busy}
            onClick={() => {
              void perform("receipt");
            }}
          >
            {copy("Query issuance receipt", "查询签发回执")}
          </Button>
        )}
        <Button
          disabled={busy}
          onClick={() => {
            void perform("list");
          }}
        >
          {copy("List my tokens", "列出我的令牌")}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || unknown}
          onClick={() => {
            void prepareAnother();
          }}
        >
          {copy("Prepare another token", "准备另一个令牌")}
        </Button>
      </div>
      <output>{message}</output>
      <ul {...stylex.props(styles.list)}>
        {credentials.map((credential) => (
          <li key={credential.credential_id} {...stylex.props(styles.row)}>
            <span>
              {credential.name} · {credential.credential_id} ·{" "}
              {credential.active
                ? copy("active", "有效")
                : copy("inactive", "失效")}
            </span>
            <span>
              {copy("Deployment", "目标部署")}: {credential.deployment} ·{" "}
              {copy("Expires", "有效期")}: {credential.expires_at}
            </span>
            <span>
              {credential.permissions.join(", ")} ·{" "}
              {JSON.stringify(credential.resource_scopes)}
            </span>
            <span>
              {copy("Created", "创建时间")}:{" "}
              {credential.created_at ??
                copy("Not reported by owner", "Owner 未提供")}{" "}
              · {copy("Last authenticated", "最近通过身份验证")}:{" "}
              {credential.last_used_at ??
                copy("Not reported by owner", "Owner 未提供")}
            </span>
            {credential.revoked_at && (
              <span>
                {copy("Token revoked", "令牌撤销时间")}: {credential.revoked_at}
              </span>
            )}
            <Button
              variant="ghost"
              disabled={busy || !credential.active}
              onClick={() => {
                void perform("revoke", credential.credential_id);
              }}
            >
              {copy("Revoke token", "撤销令牌")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function validateIssue(input: IssueRequest) {
  if (
    !input.name.trim() ||
    input.name.length > 128 ||
    !validLabel(input.deployment, 128) ||
    input.permissions.length === 0 ||
    input.permissions.length > 32 ||
    new Set(input.permissions).size !== input.permissions.length ||
    !input.permissions.every((permission) => validLabel(permission, 128)) ||
    input.resource_scopes.length === 0 ||
    input.resource_scopes.length > 16 ||
    !input.resource_scopes.every(
      (scope) =>
        scope &&
        typeof scope === "object" &&
        Object.keys(scope).every((key) => key === "kind" || key === "id") &&
        validLabel(scope.kind, 128) &&
        validLabel(scope.id, 128)
    ) ||
    new Set(input.resource_scopes.map((scope) => `${scope.kind}:${scope.id}`))
      .size !== input.resource_scopes.length ||
    new Date(input.expires_at).getTime() <= Date.now()
  ) {
    throw new TypeError("invalid");
  }
}

function validLabel(value: unknown, max: number) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)
  );
}
