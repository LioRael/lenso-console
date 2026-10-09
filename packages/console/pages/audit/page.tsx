import { useWorkspaceRead, type PageProps } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import { Select } from "@lenso/ui/select";
import { useId, useState, type FormEvent } from "react";

import {
  hasOperation,
  ManagementFrame,
  ReadState,
  refreshManagementRead,
} from "../shared";

import "../styles.css";
import "./styles.css";
import {
  auditGetSchema,
  auditPageSchema,
  auditQuerySchema,
  auditResultSchema,
  type AuditCursor,
  type AuditEvent,
  type AuditQuery,
} from "./contract";

const emptyDraft = {
  action: "",
  result: "",
  correlationId: "",
  from: "",
  to: "",
};

export default function AuditPage(props: PageProps) {
  const zh = props.environment.locale === "zh-CN";
  return (
    <ManagementFrame
      title={zh ? "审计" : "Audit"}
      description={
        zh
          ? "查找当前授权范围内的操作和结果。"
          : "Find actions and outcomes in the current authorized scope."
      }
    >
      {hasOperation(props, "audit", "query") ? (
        <AuditRecords
          key={`${props.mount.scopeKey ?? props.mount.id}:${props.mount.revision}`}
          props={props}
        />
      ) : (
        <output>
          {zh
            ? "当前工作区未提供审计查询权限。"
            : "Audit queries are not available in this workspace."}
        </output>
      )}
    </ManagementFrame>
  );
}

function AuditRecords({ props }: { props: PageProps }) {
  const zh = props.environment.locale === "zh-CN";
  const text = (en: string, cn: string) => (zh ? cn : en);
  const id = useId();
  const [draft, setDraft] = useState(emptyDraft);
  const [filters, setFilters] = useState<AuditQuery>({ limit: 25 });
  const [cursors, setCursors] = useState<Array<AuditCursor | undefined>>([
    undefined,
  ]);
  const [selected, setSelected] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const cursor = cursors.at(-1);
  const result = useWorkspaceRead({
    key: "console.audit.query",
    params: { ...filters, ...(cursor ? { cursor } : {}) },
    read: async ({ params, signal }) =>
      auditPageSchema.parse(
        await props.services.invoke("audit", "query", params, { signal })
      ),
  });
  const page = !result.blocking && !result.error ? result.data : undefined;
  const canGet = hasOperation(props, "audit", "get");
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = auditQuerySchema.safeParse({
      limit: 25,
      action: draft.action.trim() || undefined,
      result: draft.result || undefined,
      correlationId: draft.correlationId.trim() || undefined,
      recordedFrom: draft.from ? new Date(draft.from).getTime() : undefined,
      recordedTo: draft.to ? new Date(draft.to).getTime() : undefined,
    });
    if (!parsed.success) {
      setValidation(
        text(
          "Check the action, correlation ID and recorded time range.",
          "请检查操作、关联 ID 和记录时间范围。"
        )
      );
      return;
    }
    setValidation(null);
    setFilters(parsed.data);
    setCursors([undefined]);
    setSelected(null);
  }
  return (
    <div className="console-audit">
      <form className="console-audit-filters" onSubmit={apply}>
        {(["action", "correlationId", "from", "to"] as const).map((field) => {
          const label = {
            action: text("Action", "操作"),
            correlationId: text("Correlation ID", "关联 ID"),
            from: text("Recorded from", "记录开始时间"),
            to: text("Recorded to", "记录结束时间"),
          }[field];
          return (
            <label key={field} className="management-field">
              <span>{label}</span>
              <Input
                fullWidth
                aria-label={label}
                aria-describedby={validation ? `${id}-error` : undefined}
                type={
                  field === "from" || field === "to" ? "datetime-local" : "text"
                }
                value={draft[field]}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
            </label>
          );
        })}
        <div className="management-field">
          <span>{text("Outcome", "结果")}</span>
          <Select.Root<string>
            value={draft.result}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setDraft((current) => ({ ...current, result: value }));
              }
            }}
          >
            <Select.Trigger aria-label={text("Outcome", "结果")}>
              <Select.Value>
                {draft.result
                  ? outcome(draft.result, zh)
                  : text("All outcomes", "所有结果")}
              </Select.Value>
              <Select.Indicator />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner>
                <Select.Popover>
                  <Select.List>
                    {["", ...auditResultSchema.options].map((value) => (
                      <Select.Item key={value} value={value}>
                        <Select.ItemText>
                          {value
                            ? outcome(value, zh)
                            : text("All outcomes", "所有结果")}
                        </Select.ItemText>
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Popover>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </div>
        <div className="management-actions">
          <Button type="submit">{text("Apply filters", "应用筛选")}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft(emptyDraft);
              setFilters({ limit: 25 });
              setCursors([undefined]);
              setSelected(null);
              setValidation(null);
            }}
          >
            {text("Clear filters", "清除筛选")}
          </Button>
        </div>
        {validation ? (
          <p id={`${id}-error`} role="alert">
            {validation}
          </p>
        ) : null}
      </form>
      <div className="management-actions">
        <Button
          variant="secondary"
          disabled={result.blocking || result.refreshing}
          onClick={() => void refreshManagementRead(result)}
        >
          {text("Refresh events", "刷新事件")}
        </Button>
        {result.refreshing ? (
          <output>{text("Refreshing events…", "正在刷新事件…")}</output>
        ) : null}
      </div>
      <ReadState
        result={result}
        locale={props.environment.locale}
        isEmpty={(data) => data.events.length === 0}
        empty={
          filters.action ||
          filters.result ||
          filters.correlationId ||
          filters.recordedFrom !== undefined ||
          filters.recordedTo !== undefined
            ? text(
                "No events match these filters. Clear the filters or choose another recorded time range.",
                "没有符合筛选条件的事件。请清除筛选或选择其他记录时间范围。"
              )
            : text(
                "No audit events are available in this scope. Refresh to check for newly recorded events.",
                "此范围内没有审计事件。请刷新以查看新记录的事件。"
              )
        }
      />
      {page && page.events.length > 0 ? (
        <div className="console-audit-table-wrap">
          <table className="console-audit-table">
            <caption>
              {text(
                "Audit events, newest recorded first",
                "审计事件，按记录时间倒序"
              )}
            </caption>
            <thead>
              <tr>
                {[
                  text("Actor", "执行者"),
                  text("Action", "操作"),
                  text("Target", "目标"),
                  text("Outcome", "结果"),
                  text("Recorded time", "记录时间"),
                  text("Details", "详情"),
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.events.map((event) => (
                <tr key={event.id}>
                  <td>{actor(event)}</td>
                  <td>{event.action}</td>
                  <td>
                    {event.target.type}: {event.target.id}
                  </td>
                  <td>{outcome(event.result, zh)}</td>
                  <td>
                    <time dateTime={new Date(event.recordedAt).toISOString()}>
                      {new Date(event.recordedAt).toLocaleString(
                        props.environment.locale
                      )}
                    </time>
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      disabled={!canGet}
                      aria-label={text(
                        `View event ${event.id}`,
                        `查看事件 ${event.id}`
                      )}
                      aria-expanded={selected === event.id}
                      aria-controls={
                        selected === event.id ? `${id}-detail` : undefined
                      }
                      onClick={() =>
                        setSelected((current) =>
                          current === event.id ? null : event.id
                        )
                      }
                    >
                      {text("View", "查看")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {canGet ? null : (
        <p>
          {text(
            "Individual event details are not available in this workspace.",
            "当前工作区未提供事件详情权限。"
          )}
        </p>
      )}
      <div className="management-pagination">
        <Button
          variant="secondary"
          disabled={
            cursors.length === 1 || result.blocking || result.refreshing
          }
          onClick={() => {
            setCursors((current) => current.slice(0, -1));
            setSelected(null);
          }}
        >
          {text("Previous page", "上一页")}
        </Button>
        <Button
          variant="secondary"
          disabled={!page?.nextCursor || result.refreshing}
          onClick={() => {
            const next = page?.nextCursor;
            if (next) {
              setCursors((current) => [...current, next]);
              setSelected(null);
            }
          }}
        >
          {text("Next page", "下一页")}
        </Button>
      </div>
      {selected && page && canGet ? (
        <AuditDetail
          key={selected}
          props={props}
          eventId={selected}
          id={`${id}-detail`}
        />
      ) : null}
    </div>
  );
}

function AuditDetail({
  props,
  eventId,
  id,
}: {
  props: PageProps;
  eventId: string;
  id: string;
}) {
  const zh = props.environment.locale === "zh-CN";
  const text = (en: string, cn: string) => (zh ? cn : en);
  const result = useWorkspaceRead({
    key: "console.audit.get",
    params: { id: eventId },
    read: async ({ params, signal }) =>
      auditGetSchema.parse(
        await props.services.invoke("audit", "get", params, { signal })
      ),
  });
  const event = !result.blocking && !result.error ? result.data : undefined;
  return (
    <section
      id={id}
      className="console-audit-detail"
      aria-label={text("Event details", "事件详情")}
    >
      <h2>{text("Event details", "事件详情")}</h2>
      <ReadState
        result={result}
        locale={props.environment.locale}
        isEmpty={(data) => data === null}
        empty={text(
          "This event is no longer available in the authorized scope.",
          "此事件在授权范围内已不可用。"
        )}
      />
      {event ? (
        <dl>
          {[
            [text("Event ID", "事件 ID"), event.id],
            [text("Actor", "执行者"), actor(event)],
            [text("Action", "操作"), event.action],
            [
              text("Target", "目标"),
              `${event.target.type}: ${event.target.id}`,
            ],
            [text("Outcome", "结果"), outcome(event.result, zh)],
            [
              text("Occurred time", "发生时间"),
              new Date(event.occurredAt).toLocaleString(
                props.environment.locale
              ),
            ],
            [
              text("Recorded time", "记录时间"),
              new Date(event.recordedAt).toLocaleString(
                props.environment.locale
              ),
            ],
            [text("Reason code", "原因代码"), event.reasonCode],
            [
              text("Correlation ID", "关联 ID"),
              event.correlationId ?? text("Not recorded", "未记录"),
            ],
            ...(event.relation
              ? [
                  [
                    text("Related event", "关联事件"),
                    `${event.relation.kind}: ${event.relation.eventId}`,
                  ],
                ]
              : []),
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div>
            <dt>{text("Summary", "摘要")}</dt>
            <dd>
              {Object.keys(event.summary).length ? (
                <dl>
                  {Object.entries(event.summary).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                text("No summary fields recorded.", "未记录摘要字段。")
              )}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function actor(event: AuditEvent) {
  return event.actor.kind === "system"
    ? `system: ${event.actor.systemId}`
    : `${event.actor.kind}: ${event.actor.realmId}/${event.actor.subjectId}`;
}

function outcome(value: string, zh: boolean) {
  if (!zh) {
    return value;
  }
  switch (value) {
    case "intent": {
      return "意图";
    }
    case "success": {
      return "成功";
    }
    case "failure": {
      return "失败";
    }
    case "denied": {
      return "拒绝";
    }
    case "unknown": {
      return "未知";
    }
    default: {
      return value;
    }
  }
}
