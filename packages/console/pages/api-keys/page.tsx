import type { PageProps, ReadSnapshot } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import { Modal } from "@lenso/ui/modal";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";

import {
  ManagementFrame,
  ReadState,
  hasOperation,
  managementErrorMessage,
  refreshManagementRead,
  useManagementMutation,
  useManagementRead,
} from "../shared";
import {
  credentialResultSchema,
  keyListSchema,
  keyReadSchema,
  type KeyMetadata,
} from "./schema";

import "../styles.css";

export {
  credentialResultSchema,
  keyListSchema,
  keyMetadataSchema,
  keyReadSchema,
} from "./schema";

export default function ApiKeysPage(props: PageProps) {
  // A new runtime scope remounts all local drafts and one-time credentials.
  return (
    <ApiKeysSession
      key={`${props.mount.scopeKey ?? props.mount.id}:${props.mount.revision}`}
      {...props}
    />
  );
}

function ApiKeysSession(props: PageProps) {
  const t = (en: string, cn: string) =>
    props.environment.locale === "zh-CN" ? cn : en;
  const [after, setAfter] = useState<string | undefined>();
  const [pages, setPages] = useState<(string | undefined)[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"issue" | "rotate" | "revoke" | null>(
    null
  );
  const [scopes, setScopes] = useState("");
  const [expiry, setExpiry] = useState("");
  const [overlap, setOverlap] = useState("0");
  const [credential, setCredential] = useState<{
    value: string;
    signal: AbortSignal;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const requestId = useRef("");
  const busy = useRef(false);
  const attempted = useRef(false);
  const currentSignal = useRef(props.signal);
  useLayoutEffect(() => {
    currentSignal.current = props.signal;
  }, [props.signal]);
  const list = useManagementRead(
    props,
    "api-keys",
    "list",
    { limit: 50, ...(after ? { after } : {}) },
    keyListSchema,
    "api-keys.list"
  );
  const mutation = useManagementMutation(props);
  useEffect(() => {
    const clear = () => {
      setCredential(null);
      setDialog(null);
      setSelected(null);
    };
    props.signal.addEventListener("abort", clear);
    if (props.signal.aborted) {
      clear();
    }
    return () => props.signal.removeEventListener("abort", clear);
  }, [props.signal]);
  const open = (kind: "issue" | "rotate" | "revoke") => {
    if (busy.current || props.signal.aborted) {
      return;
    }
    setCredential(null);
    setNotice("");
    attempted.current = false;
    requestId.current = crypto.randomUUID();
    setDialog(kind);
  };
  const invalidate = async () => {
    await Promise.all([
      props.reads?.invalidate({ key: "api-keys.list" }),
      props.reads?.invalidate({ key: "api-keys.read" }),
    ]);
  };
  const submit = async (key?: ReadSnapshot<KeyMetadata>) => {
    if (busy.current || attempted.current || props.signal.aborted) {
      return;
    }
    const kind = dialog;
    if (!kind) {
      return;
    }
    const { credentials } = props;
    const expiresAt = new Date(expiry).getTime();
    const overlapMs = Number(overlap);
    const requestedScopes = [
      ...new Set(scopes.split(/[,\s]+/).filter(Boolean)),
    ];
    if (
      kind === "issue" &&
      (!Number.isSafeInteger(expiresAt) ||
        expiresAt <= Date.now() ||
        requestedScopes.length > 128)
    ) {
      setNotice(
        t(
          "Enter a future expiry and at most 128 scopes.",
          "请填写未来的到期时间，权限范围最多为128项。"
        )
      );
      return;
    }
    if (
      kind === "rotate" &&
      (!Number.isSafeInteger(overlapMs) || overlapMs < 0)
    ) {
      setNotice(
        t(
          "Overlap must be a nonnegative whole number of milliseconds.",
          "重叠时间必须为非负整数，单位为毫秒。"
        )
      );
      return;
    }
    if (kind !== "issue" && !key) {
      return;
    }
    busy.current = true;
    attempted.current = true;
    setNotice("");
    try {
      await mutation.run(async (signal) => {
        if (kind === "revoke" && key) {
          if (!hasOperation(props, "api-keys", "revoke")) {
            throw new Error("denied");
          }
          const acknowledged = z
            .boolean()
            .parse(
              await props.services.invoke(
                "api-keys",
                "revoke",
                { id: key.id },
                { signal }
              )
            );
          signal.throwIfAborted();
          props.signal.throwIfAborted();
          setNotice(
            acknowledged
              ? t("Key revoked.", "密钥已撤销。")
              : t(
                  "No revocation was acknowledged. Refresh the key to inspect its current state.",
                  "未确认撤销，请刷新查看密钥的当前状态。"
                )
          );
          setDialog(null);
          void refreshManagementRead({ refetch: invalidate });
          return;
        }
        if (!credentials) {
          throw new Error("unavailable");
        }
        const raw =
          kind === "issue"
            ? await credentials.issue(
                { requestedScopes, expiresAt, requestId: requestId.current },
                { signal }
              )
            : key
              ? await credentials.rotate(
                  { id: key.id, expectedRevision: key.revision, overlapMs },
                  { signal }
                )
              : null;
        signal.throwIfAborted();
        props.signal.throwIfAborted();
        if (currentSignal.current !== props.signal) {
          return;
        }
        const result = credentialResultSchema.parse(raw);
        setCredential(
          result.credential === null
            ? null
            : { value: result.credential, signal: props.signal }
        );
        setNotice(
          result.credential === null
            ? t(
                "This request has already completed, but its credential cannot be recovered. Inspect the key before deciding whether to rotate it. Nothing was issued again.",
                "此请求已完成，但无法恢复凭据。请查看密钥后决定是否轮换。未重新签发。"
              )
            : t(
                "Save this credential now. Dismissing it clears this view; it cannot be read again.",
                "请立即保存此凭据。关闭后将清除此视图，无法再次读取。"
              )
        );
        setDialog(null);
        // Read invalidation is separate from the acknowledged one-time result.
        void refreshManagementRead({ refetch: invalidate });
      });
    } catch (error) {
      if (!props.signal.aborted) {
        setNotice(managementErrorMessage(error, props.environment.locale));
      }
    } finally {
      busy.current = false;
    }
  };
  return (
    <ManagementFrame
      title={t("API keys", "API密钥")}
      description={t(
        "Inspect delegated scopes and key lifetime. Credentials are never returned by list or detail reads.",
        "查看委托权限和密钥有效期。列表和详情不会返回凭据。"
      )}
      actions={
        <>
          <Button
            variant="secondary"
            disabled={list.refreshing}
            onClick={() => void refreshManagementRead(list)}
          >
            {t("Refresh", "刷新")}
          </Button>
          {props.credentials?.operations.includes("issue") && (
            <Button disabled={mutation.pending} onClick={() => open("issue")}>
              {t("Issue key", "签发密钥")}
            </Button>
          )}
        </>
      }
    >
      <ReadState
        result={list}
        locale={props.environment.locale}
        empty={t("No keys in this authorized scope.", "此授权范围内没有密钥。")}
        isEmpty={list.data?.length === 0}
      />
      {notice && <output className="management-notice">{notice}</output>}
      {credential !== null &&
        credential.signal === props.signal &&
        !props.signal.aborted && (
          <section
            className="management-detail"
            aria-label={t("One-time credential", "一次性凭据")}
          >
            <h2>{t("One-time credential", "一次性凭据")}</h2>
            <p className="management-muted">
              {t(
                "Copy it into your secret manager. Do not put it in URLs or logs.",
                "请复制到凭据管理器，不要放入网址或日志。"
              )}
            </p>
            <pre className="management-meta">{credential.value}</pre>
            <Button variant="secondary" onClick={() => setCredential(null)}>
              {t("Dismiss credential", "清除凭据")}
            </Button>
          </section>
        )}
      {!list.error && list.data && (
        <div className="management-list">
          {list.data.map((key) => (
            <article className="management-row" key={key.id}>
              <div className="management-copy">
                <h2>{key.id}</h2>
                <p>
                  {key.revokedAt === null
                    ? key.expiresAt <= Date.now()
                      ? t("Expired", "已到期")
                      : t("Active", "有效")
                    : t("Revoked", "已撤销")}
                </p>
                <p className="management-meta">
                  {key.scopes.length
                    ? key.scopes.join(", ")
                    : t("No scopes", "无权限范围")}
                </p>
                <p>
                  {t("Expires", "到期")}:{" "}
                  {new Date(key.expiresAt).toLocaleString(
                    props.environment.locale
                  )}
                </p>
              </div>
              {hasOperation(props, "api-keys", "read") && (
                <Button
                  variant="secondary"
                  disabled={mutation.pending}
                  onClick={() => setSelected(key.id)}
                >
                  {t("Details", "详情")}
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {!list.error && list.data && (
        <div className="management-pagination">
          <Button
            variant="secondary"
            disabled={pages.length === 0 || list.blocking}
            onClick={() => {
              setAfter(pages.at(-1));
              setPages(pages.slice(0, -1));
            }}
          >
            {t("Previous", "上一页")}
          </Button>
          <Button
            variant="secondary"
            disabled={list.data.length < 50 || list.blocking}
            onClick={() => {
              const last = list.data?.at(-1);
              if (last) {
                setPages([...pages, after]);
                setAfter(last.id);
              }
            }}
          >
            {t("Next", "下一页")}
          </Button>
        </div>
      )}
      {!list.error && selected && (
        <KeyDetails
          key={selected}
          props={props}
          id={selected}
          onClose={() => {
            if (!busy.current) {
              setSelected(null);
              setDialog(null);
            }
          }}
          onAction={open}
          dialog={dialog}
          submit={submit}
          pending={mutation.pending}
          attempted={attempted.current}
          overlap={overlap}
          setOverlap={setOverlap}
          notice={notice}
        />
      )}
      <Modal.Root
        open={dialog === "issue"}
        onOpenChange={(next) => {
          if (!next && !busy.current) {
            setDialog(null);
          }
        }}
      >
        <Modal.Portal>
          <Modal.Backdrop />
          <Modal.Viewport>
            <Modal.Popup>
              <form
                className="management-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <Modal.Header>
                  <Modal.Title>{t("Issue API key", "签发API密钥")}</Modal.Title>
                  <Modal.Description>
                    {t(
                      "Scopes are a proposal. The host enforces the caller's grant ceiling and binds the subject.",
                      "权限范围仅为申请。主机会执行调用者的授权上限并绑定主体。"
                    )}
                  </Modal.Description>
                </Modal.Header>
                <Modal.Body>
                  <label className="management-field">
                    {t(
                      "Requested scopes (comma or space separated)",
                      "申请权限范围（以逗号或空格分隔）"
                    )}
                    <Input
                      value={scopes}
                      onValueChange={setScopes}
                      disabled={mutation.pending || attempted.current}
                      fullWidth
                    />
                  </label>
                  <label className="management-field">
                    {t("Expiry (local time)", "到期时间（本地时间）")}
                    <Input
                      type="datetime-local"
                      value={expiry}
                      onValueChange={setExpiry}
                      required
                      disabled={mutation.pending || attempted.current}
                      fullWidth
                    />
                  </label>
                  {notice && <output>{notice}</output>}
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    variant="secondary"
                    disabled={mutation.pending}
                    onClick={() => setDialog(null)}
                  >
                    {t("Cancel", "取消")}
                  </Button>
                  <Button
                    type="submit"
                    isLoading={mutation.pending}
                    disabled={attempted.current}
                  >
                    {t("Issue key", "签发密钥")}
                  </Button>
                </Modal.Footer>
              </form>
            </Modal.Popup>
          </Modal.Viewport>
        </Modal.Portal>
      </Modal.Root>
    </ManagementFrame>
  );
}

function KeyDetails({
  props,
  id,
  onClose,
  onAction,
  dialog,
  submit,
  pending,
  attempted,
  overlap,
  setOverlap,
  notice,
}: {
  props: PageProps;
  id: string;
  onClose(): void;
  onAction(kind: "rotate" | "revoke"): void;
  dialog: "issue" | "rotate" | "revoke" | null;
  submit(key: ReadSnapshot<KeyMetadata>): Promise<void>;
  pending: boolean;
  attempted: boolean;
  overlap: string;
  setOverlap(value: string): void;
  notice: string;
}) {
  const t = (en: string, cn: string) =>
    props.environment.locale === "zh-CN" ? cn : en;
  const result = useManagementRead(
    props,
    "api-keys",
    "read",
    { id },
    keyReadSchema,
    "api-keys.read"
  );
  const key = result.error ? undefined : result.data;
  return (
    <section className="management-detail">
      <div className="management-actions">
        <h2>{t("Key details", "密钥详情")}</h2>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          {t("Close details", "关闭详情")}
        </Button>
      </div>
      <ReadState
        result={result}
        locale={props.environment.locale}
        empty={t("This key is no longer available.", "此密钥已不可用。")}
        isEmpty={key === null}
      />
      {key && (
        <>
          <dl className="management-meta">
            <dt>{t("ID", "标识")}</dt>
            <dd>{key.id}</dd>
            <dt>{t("Subject", "主体")}</dt>
            <dd>
              {key.subject.namespace} / {key.subject.tenantId} /{" "}
              {key.subject.subjectId}
            </dd>
            <dt>{t("Revision", "版本")}</dt>
            <dd>{key.revision}</dd>
            <dt>{t("Scopes", "权限范围")}</dt>
            <dd>{key.scopes.join(", ") || t("No scopes", "无权限范围")}</dd>
            <dt>{t("Issued", "签发")}</dt>
            <dd>
              {new Date(key.issuedAt).toLocaleString(props.environment.locale)}
            </dd>
            <dt>{t("Expiry", "到期")}</dt>
            <dd>
              {new Date(key.expiresAt).toLocaleString(props.environment.locale)}
            </dd>
            <dt>{t("Revoked", "撤销")}</dt>
            <dd>
              {key.revokedAt === null
                ? t("Not revoked", "未撤销")
                : new Date(key.revokedAt).toLocaleString(
                    props.environment.locale
                  )}
            </dd>
            <dt>{t("Predecessor overlap ends", "前序凭据重叠结束")}</dt>
            <dd>
              {key.overlapUntil === null
                ? t("No overlap", "无重叠")
                : new Date(key.overlapUntil).toLocaleString(
                    props.environment.locale
                  )}
            </dd>
          </dl>
          <div className="management-actions">
            {props.credentials?.operations.includes("rotate") &&
              key.revokedAt === null &&
              key.expiresAt > Date.now() && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onAction("rotate")}
                >
                  {t("Rotate key", "轮换密钥")}
                </Button>
              )}
            {hasOperation(props, "api-keys", "revoke") &&
              key.revokedAt === null && (
                <Button
                  variant="danger-soft"
                  disabled={pending}
                  onClick={() => onAction("revoke")}
                >
                  {t("Revoke key", "撤销密钥")}
                </Button>
              )}
          </div>
          <Modal.Root
            open={dialog === "rotate" || dialog === "revoke"}
            onOpenChange={(next) => {
              if (!next && !pending) {
                onClose();
              }
            }}
          >
            <Modal.Portal>
              <Modal.Backdrop />
              <Modal.Viewport>
                <Modal.Popup>
                  <form
                    className="management-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submit(key);
                    }}
                  >
                    <Modal.Header>
                      <Modal.Title>
                        {dialog === "revoke"
                          ? t("Revoke this key?", "撤销此密钥？")
                          : t("Rotate this key?", "轮换此密钥？")}
                      </Modal.Title>
                      <Modal.Description>
                        {dialog === "revoke"
                          ? t(
                              "Revocation invalidates the current key and its overlapping predecessor. The service rechecks your authority.",
                              "撤销会使当前密钥及其重叠的前序凭据失效。服务会重新检查您的权限。"
                            )
                          : t(
                              "Rotation uses the displayed revision. Zero overlap invalidates the old credential immediately. The host bounds overlap by its policy and original expiry; another rotation is refused while overlap is active.",
                              "轮换使用显示的版本。零重叠会立即使旧凭据失效。主机会根据策略和原到期时间限制重叠时间，重叠期间不可再次轮换。"
                            )}
                      </Modal.Description>
                    </Modal.Header>
                    <Modal.Body>
                      <p className="management-meta">
                        {key.id} · {t("Revision", "版本")} {key.revision}
                      </p>
                      {dialog === "rotate" && (
                        <label className="management-field">
                          {t("Overlap (milliseconds)", "重叠时间（毫秒）")}
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            required
                            value={overlap}
                            onValueChange={setOverlap}
                            disabled={pending || attempted}
                            fullWidth
                          />
                        </label>
                      )}
                      {notice && <output>{notice}</output>}
                    </Modal.Body>
                    <Modal.Footer>
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={onClose}
                      >
                        {t("Cancel", "取消")}
                      </Button>
                      <Button
                        type="submit"
                        variant={dialog === "revoke" ? "danger" : "primary"}
                        disabled={attempted}
                        isLoading={pending}
                      >
                        {dialog === "revoke"
                          ? t("Confirm revocation", "确认撤销")
                          : t("Confirm rotation", "确认轮换")}
                      </Button>
                    </Modal.Footer>
                  </form>
                </Modal.Popup>
              </Modal.Viewport>
            </Modal.Portal>
          </Modal.Root>
        </>
      )}
    </section>
  );
}
