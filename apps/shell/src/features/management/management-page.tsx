import { Button } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import { TextField } from "@lenso/ui/textfield";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  decodeCatalogResponse,
  decodeInvokeResponse,
  type CatalogResponse,
  type Entry,
  type InvokeRequest,
  type InvokeResponse,
} from "../../../../../contracts/crates/lenso-capability-management/generated/bindings";
import { useConsoleLocale } from "../../app/console-locale";
import { useConsoleSession } from "../../app/console-session";
import { ConsolePageHeader } from "../../components/runtime/console-page-header";
import { sessionFetch } from "../../lib/session-fetch";
import { settingsPageStyles as page } from "../settings/settings-page.stylex";
import { HumanApprovalPanel } from "./human-approval-panel";
import { HumanTokenPanel } from "./human-token-panel";
import { ParameterFields } from "./parameter-fields";

const styles = stylex.create({
  section: { display: "grid", gap: 16, padding: 16, marginTop: 24 },
  entries: { display: "flex", flexWrap: "wrap", gap: 8 },
  field: { display: "grid", gap: 8, fontSize: 13 },
  editor: {
    backgroundColor: "var(--field-background)",
    color: "var(--foreground)",
    border: "1px solid var(--field-border)",
    borderRadius: 8,
    padding: 12,
    minHeight: 120,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "monospace",
    fontSize: 13,
    resize: "vertical",
    outlineColor: "var(--field-border-focus)",
  },
  result: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
  },
  actions: { display: "flex", flexWrap: "wrap", gap: 8 },
});

type Problem = "denied" | "stale" | "invalid" | "unavailable";
async function responseText(response: Response): Promise<string> {
  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 401
        ? "denied"
        : response.status === 409
          ? "stale"
          : response.status === 422
            ? "invalid"
            : "unavailable"
    );
  }
  return response.text();
}
function starter(entry: Entry): string {
  try {
    const schema = JSON.parse(entry.input_schema_json) as {
      properties?: Record<string, { type?: string; default?: unknown }>;
    };
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, field]) => [
          key,
          field.default ??
            (field.type === "boolean"
              ? false
              : field.type === "integer" || field.type === "number"
                ? 0
                : field.type === "object"
                  ? {}
                  : field.type === "array"
                    ? []
                    : ""),
        ])
      ),
      null,
      2
    );
  } catch {
    return "{}";
  }
}

export function ManagementPage() {
  const { managementEnabled, humanManagementEnabled, subject } =
    useConsoleSession();
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const copy = (en: string, cn: string) => (zh ? cn : en);
  const [catalog, setCatalog] = useState<CatalogResponse>();
  const [selected, setSelected] = useState<Entry>();
  const [input, setInput] = useState("{}");
  const [revision, setRevision] = useState("");
  const [operation, setOperation] = useState<InvokeResponse>();
  const [intent, setIntent] = useState<InvokeRequest>();
  const [uncertainWrite, setUncertainWrite] = useState(false);
  const [problem, setProblem] = useState<Problem>();
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
      controller.current?.abort();
    },
    []
  );
  const run = useCallback(
    async (action: (signal: AbortSignal) => Promise<void>) => {
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      generation.current += 1;
      const ticket = generation.current;
      setBusy(true);
      setProblem(undefined);
      try {
        await action(request.signal);
      } catch (error) {
        if (!request.signal.aborted && ticket === generation.current) {
          const message =
            error instanceof Error ? error.message : "unavailable";
          setProblem(
            message === "denied" || message === "stale" || message === "invalid"
              ? message
              : "unavailable"
          );
        }
      } finally {
        if (ticket === generation.current) {
          setBusy(false);
        }
      }
    },
    []
  );
  const load = useCallback(
    () =>
      run(async (signal) => {
        const value = decodeCatalogResponse(
          await responseText(
            await sessionFetch("/api/console/v1/management/catalog", {
              signal,
              cache: "no-store",
            })
          )
        );
        if (!signal.aborted) {
          setCatalog(value);
          setSelected((current) =>
            current &&
            !value.entries.some(
              (entry) =>
                entry.id === current.id && entry.version === current.version
            )
              ? undefined
              : current
          );
        }
      }),
    [run]
  );
  useEffect(() => {
    if (managementEnabled) {
      void load();
    }
  }, [managementEnabled, load]);
  const invoke = () =>
    run(async (signal) => {
      if (!selected || !catalog) {
        throw new Error("stale");
      }
      let payload: unknown;
      try {
        payload = JSON.parse(input);
      } catch {
        throw new Error("invalid");
      }
      const request = intent ?? {
        entry_id: selected.id,
        version: selected.version,
        input_json: JSON.stringify(payload),
        idempotency_key:
          selected.effect === "write" ? crypto.randomUUID() : null,
        expected_revision: revision || null,
      };
      if (selected.effect === "write") {
        setIntent(request);
      }
      try {
        const result = decodeInvokeResponse(
          await responseText(
            await sessionFetch("/api/console/v1/management/invoke", {
              method: "POST",
              signal,
              headers: {
                "Content-Type": "application/json",
                "X-Lenso-Expected-Subject": subject,
              },
              body: JSON.stringify(request),
            })
          )
        );
        if (!signal.aborted) {
          setOperation(result);
          setUncertainWrite(false);
        }
      } catch (error) {
        const knownRejection =
          error instanceof Error &&
          (error.message === "denied" ||
            error.message === "stale" ||
            error.message === "invalid");
        if (selected.effect === "write" && !signal.aborted && !knownRejection) {
          setUncertainWrite(true);
        }
        throw error;
      }
    });
  const status = () =>
    run(async (signal) => {
      if (!operation?.operation_id) {
        throw new Error("invalid");
      }
      const result = decodeInvokeResponse(
        await responseText(
          await sessionFetch(
            `/api/console/v1/management/operations/${encodeURIComponent(operation.operation_id)}`,
            { signal, cache: "no-store" }
          )
        )
      );
      if (!signal.aborted) {
        setOperation(result);
        setUncertainWrite(false);
      }
    });
  const states: Record<InvokeResponse["state"], string> = {
    pending_approval: copy(
      "Waiting for human approval. Refresh the status after the reviewer decides.",
      "等待真人审批。审批人决定后，请查询状态。"
    ),
    ready: copy(
      "Approved operation ready. Continue with the original parameters.",
      "操作已就绪。继续时使用原始参数。"
    ),
    executing: copy(
      "Executing. Query the status; keep the original operation ID.",
      "正在执行。请查询状态并保留原始操作 ID。"
    ),
    succeeded: copy("Completed", "已完成"),
    failed: copy("Failed", "执行失败"),
    unknown: copy(
      "The result is unknown. Query the receipt before taking another action; this page will not replay the write.",
      "结果未知。请先查询回执；本页面不会重放写操作。"
    ),
    cancelled: copy("Cancelled", "已取消"),
  };
  const problems: Record<Problem, string> = {
    denied: copy(
      "Your current account cannot perform this operation.",
      "当前账号无权执行此操作。"
    ),
    stale: copy(
      "The catalog changed. Refresh it before choosing an operation.",
      "目录已变化，请刷新后重新选择操作。"
    ),
    invalid: copy(
      "Check the parameters against the owner's schema.",
      "请按业务方的参数结构检查输入。"
    ),
    unavailable: copy(
      "The response is unavailable. Query any retained operation ID before submitting again.",
      "暂时无法获取响应。再次提交前，请先查询已保留的操作 ID。"
    ),
  };
  return (
    <section {...stylex.props(page.page)}>
      <div {...stylex.props(page.column)}>
        <ConsolePageHeader
          title={copy("Management", "管理")}
          description={copy(
            "Operations admitted for your current account. Business owners enforce permissions and approval.",
            "仅显示当前账号可使用的操作；业务方负责权限和审批。"
          )}
          actions={
            <Button
              disabled={busy || !managementEnabled}
              variant="ghost"
              onClick={() => {
                void load();
              }}
            >
              {copy("Refresh catalog", "刷新目录")}
            </Button>
          }
        />
        {humanManagementEnabled && <HumanApprovalPanel />}
        {humanManagementEnabled && catalog && (
          <HumanTokenPanel
            key={catalog.deployment}
            deployment={catalog.deployment}
          />
        )}
        {managementEnabled ? (
          <>
            {busy && <output>{copy("Loading…", "加载中…")}</output>}
            {problem && <p role="alert">{problems[problem]}</p>}
            {catalog && (
              <section
                {...stylex.props(styles.section)}
                aria-label={copy("Available operations", "可用操作")}
              >
                <p {...stylex.props(page.description)}>{catalog.deployment}</p>
                {catalog.entries.length === 0 ? (
                  <p>
                    {copy(
                      "No operations are available for this account.",
                      "当前账号没有可用操作。"
                    )}
                  </p>
                ) : (
                  <div {...stylex.props(styles.entries)}>
                    {catalog.entries.map((entry) => (
                      <Button
                        key={entry.id}
                        variant={
                          selected?.id === entry.id ? "secondary" : "ghost"
                        }
                        disabled={busy || Boolean(intent)}
                        onClick={() => {
                          setSelected(entry);
                          setInput(starter(entry));
                          setRevision("");
                          setOperation(undefined);
                        }}
                      >
                        {entry.description}
                      </Button>
                    ))}
                  </div>
                )}
              </section>
            )}
            {selected && (
              <form
                {...stylex.props(styles.section, page.group)}
                onSubmit={(event) => {
                  event.preventDefault();
                  void invoke();
                }}
              >
                <h2 {...stylex.props(page.sectionTitle)}>
                  {selected.description}
                </h2>
                <p {...stylex.props(page.description)}>
                  {selected.effect === "read"
                    ? copy("Read", "读取")
                    : selected.requires_approval
                      ? copy(
                          "Write · human approval required",
                          "写入 · 需要真人审批"
                        )
                      : copy("Write", "写入")}
                </p>
                <ParameterFields
                  schemaJson={selected.input_schema_json}
                  inputJson={input}
                  disabled={busy || Boolean(intent)}
                  onChange={setInput}
                />
                <label {...stylex.props(styles.field)}>
                  {copy("Parameters (JSON)", "参数（JSON）")}
                  <textarea
                    {...stylex.props(styles.editor)}
                    value={input}
                    maxLength={262144}
                    disabled={busy || Boolean(intent)}
                    onChange={(event) => setInput(event.target.value)}
                  />
                </label>
                {selected.effect === "write" && (
                  <label {...stylex.props(styles.field)}>
                    {copy(
                      "Expected revision (if required)",
                      "预期版本（如需要）"
                    )}
                    <TextField.Root>
                      <Input
                        value={revision}
                        disabled={busy || Boolean(intent)}
                        onChange={(event) => setRevision(event.target.value)}
                      />
                    </TextField.Root>
                  </label>
                )}
                <div {...stylex.props(styles.actions)}>
                  <Button
                    type="submit"
                    disabled={
                      busy ||
                      uncertainWrite ||
                      (Boolean(intent) &&
                        operation?.state !== "ready" &&
                        operation?.state !== "pending_approval")
                    }
                  >
                    {intent
                      ? copy("Continue original operation", "继续原始操作")
                      : copy("Submit operation", "提交操作")}
                  </Button>
                  {operation?.operation_id && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        void status();
                      }}
                    >
                      {copy("Query status", "查询状态")}
                    </Button>
                  )}
                  {intent &&
                    !uncertainWrite &&
                    (operation?.state === "succeeded" ||
                      operation?.state === "failed" ||
                      operation?.state === "cancelled") && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setIntent(undefined);
                          setOperation(undefined);
                        }}
                      >
                        {copy("New operation", "新操作")}
                      </Button>
                    )}
                </div>
              </form>
            )}
            {(operation || uncertainWrite) && (
              <section {...stylex.props(styles.section)} aria-live="polite">
                <h2 {...stylex.props(page.sectionTitle)}>
                  {states[uncertainWrite ? "unknown" : operation!.state]}
                </h2>
                {operation?.operation_id && (
                  <p {...stylex.props(styles.result)}>
                    {copy("Operation ID", "操作 ID")}: {operation.operation_id}
                  </p>
                )}
                {intent?.idempotency_key && (
                  <p {...stylex.props(styles.result)}>
                    {copy("Request ID", "请求 ID")}: {intent.idempotency_key}
                  </p>
                )}
                {operation?.audit_pending && (
                  <p>
                    {copy(
                      "Audit delivery pending; the operation will not be replayed.",
                      "审计记录等待送达；操作不会重放。"
                    )}
                  </p>
                )}
                {!uncertainWrite && operation?.receipt && (
                  <p {...stylex.props(styles.result)}>
                    {copy("Receipt", "回执")}: {operation.receipt}
                  </p>
                )}
                {!uncertainWrite && operation?.result_json && (
                  <pre {...stylex.props(styles.result)}>
                    {operation.result_json}
                  </pre>
                )}
              </section>
            )}
          </>
        ) : (
          <output>
            {copy(
              "Management is unavailable in this Console profile.",
              "此 Console 未启用受控管理。"
            )}
          </output>
        )}
      </div>
    </section>
  );
}
