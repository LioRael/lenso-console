import { Button } from "@lenso/ui/button";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import {
  decodeDecideResponse,
  decodeReadIntentResponse,
  type DecideRequest,
  type ReadIntentResponse,
} from "../../../contracts/crates/lenso-capability-management-human/generated/bindings";
import { useConsoleLocale } from "../../app/console-locale";
import { sessionFetch } from "../../lib/session-fetch";
import { settingsPageStyles as page } from "../settings/settings-page.stylex";

type Decision = DecideRequest["decision"];

const styles = stylex.create({
  panel: { display: "grid", gap: 16, padding: 16, marginTop: 32 },
  field: { display: "grid", gap: 8, fontSize: 13 },
  data: {
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    margin: 0,
  },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
});
export function HumanApprovalPanel() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const copy = (en: string, cn: string) => (zh ? cn : en);
  const [operationId, setOperationId] = useState("");
  const [review, setReview] = useState<ReadIntentResponse>();
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const perform = async (decision?: Decision) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage("");
    try {
      const response =
        decision && review
          ? await sessionFetch("/api/console/v1/human-management/decide", {
              method: "POST",
              signal: controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                operation_id: review.operation_id,
                intent_digest: review.intent_digest,
                decision,
              }),
            })
          : await sessionFetch(
              `/api/console/v1/human-management/intents/${encodeURIComponent(operationId)}`,
              { signal: controller.signal, cache: "no-store" }
            );
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? "denied"
            : response.status === 409
              ? "changed"
              : "unavailable"
        );
      }
      const text = await response.text();
      if (controller.signal.aborted) {
        return;
      }
      if (decision) {
        const result = decodeDecideResponse(text);
        setReview((current) =>
          current
            ? {
                ...current,
                status: result.status,
                audit_pending: result.audit_pending,
              }
            : current
        );
        setMessage(
          copy(
            "Decision recorded. The requester must continue the original operation with its existing ID and parameters.",
            "决定已记录。发起人须使用原操作 ID 和参数继续执行。"
          )
        );
      } else {
        setReview(decodeReadIntentResponse(text));
        setNeedsRefresh(false);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (decision) {
          setNeedsRefresh(true);
        }
        const reason = error instanceof Error ? error.message : "unavailable";
        setMessage(
          reason === "denied"
            ? copy(
                "This account cannot review or decide this request. Requesters cannot approve their own operation.",
                "当前账号无权审阅或决定此请求，发起人不能自行批准。"
              )
            : reason === "changed"
              ? copy(
                  "The intent changed. Load a fresh server snapshot before deciding.",
                  "意图已变化，请重新读取服务端快照。"
                )
              : copy(
                  "The response is unavailable. Query the intent before trying another decision.",
                  "暂时无法获取响应，请先查询意图再决定。"
                )
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  };
  return (
    <section
      {...stylex.props(styles.panel, page.group)}
      aria-label={copy("Human approval", "真人审批")}
    >
      <h2 {...stylex.props(page.sectionTitle)}>
        {copy("Human approval", "真人审批")}
      </h2>
      <p {...stylex.props(page.description)}>
        {copy(
          "Review the server's immutable request. Agent confirmations do not grant approval.",
          "审阅服务端的不可变请求；Agent 的确认不能授予审批。"
        )}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setReview(undefined);
          void perform();
        }}
      >
        <label {...stylex.props(styles.field)}>
          {copy("Operation ID", "操作 ID")}
          <TextField.Root>
            <TextField.Control
              value={operationId}
              maxLength={128}
              required
              disabled={busy}
              onChange={(event) => {
                setOperationId(event.target.value);
                setReview(undefined);
              }}
            />
          </TextField.Root>
        </label>
        <Button type="submit" variant="ghost" disabled={busy || !operationId}>
          {copy("Load intent", "读取意图")}
        </Button>
      </form>
      {message && <output aria-live="polite">{message}</output>}
      {review && (
        <>
          <dl {...stylex.props(styles.data)}>
            <dt>{copy("Requester", "发起人")}</dt>
            <dd>{review.requester}</dd>
            <dt>{copy("Deployment and target", "部署与目标")}</dt>
            <dd>
              {review.deployment} · {review.target_instance}
            </dd>
            <dt>{copy("Operation", "操作")}</dt>
            <dd>
              {review.description} · {review.capability} · {review.operation} ·{" "}
              {review.version}
            </dd>
            <dt>{copy("Expires", "有效期")}</dt>
            <dd>{review.expires_at}</dd>
            <dt>{copy("Intent digest", "意图摘要")}</dt>
            <dd>{review.intent_digest}</dd>
            <dt>{copy("State", "状态")}</dt>
            <dd>{review.status}</dd>
          </dl>
          <pre {...stylex.props(styles.data)}>{review.parameters_json}</pre>
          {review.audit_pending && (
            <output>
              {copy(
                "Audit delivery pending. Query this intent to confirm delivery.",
                "审计待送达，请查询此意图确认状态。"
              )}
            </output>
          )}
          <div {...stylex.props(styles.actions)}>
            <Button
              disabled={busy || needsRefresh || review.status !== "pending"}
              onClick={() => {
                void perform("approved");
              }}
            >
              {copy("Approve this exact request", "批准此精确请求")}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || needsRefresh || review.status !== "pending"}
              onClick={() => {
                void perform("rejected");
              }}
            >
              {copy("Reject request", "拒绝请求")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
