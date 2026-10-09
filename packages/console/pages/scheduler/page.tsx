import { useWorkspaceReadClient, type PageProps } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { useRef, useState } from "react";

import {
  ManagementFrame,
  ReadState,
  hasOperation,
  refreshManagementRead,
  useManagementMutation,
  useManagementRead,
} from "../shared";
import { jobStateLabel } from "../tasks/page";
import { useVisiblePolling } from "../tasks/poll";
import { ScheduleCreation } from "./create";
import {
  occurrencesSchema,
  scheduleListSchema,
  scheduleSummarySchema,
  scheduleTriggerSchema,
  schedulerErrorCode,
  type ScheduleSummary,
} from "./schemas";

export function scheduleStateLabel(
  state: ScheduleSummary["state"],
  zh: boolean
) {
  return {
    active: zh ? "启用中" : "Active",
    paused: zh ? "已暂停" : "Paused",
    cancelled: zh ? "已取消" : "Cancelled",
    completed: zh ? "已完成" : "Completed",
  }[state];
}

export function scheduleTime(value: number | null, locale: string) {
  if (value === null) {
    return locale === "zh-CN" ? "无" : "None";
  }
  if (Number.isNaN(new Date(value).getTime())) {
    return locale === "zh-CN" ? "时间不可用" : "Time unavailable";
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(value);
}

export function scheduleRuleLabel(
  rule: ScheduleSummary["rule"],
  locale: string
) {
  return rule.kind === "once"
    ? `${locale === "zh-CN" ? "单次" : "Once"}: ${scheduleTime(rule.at, locale)}`
    : `${rule.expression} (${rule.timezone})`;
}

function Occurrences({ props, id }: { props: PageProps; id: string }) {
  const zh = props.environment.locale === "zh-CN";
  const result = useManagementRead(
    props,
    "scheduler",
    "occurrences",
    { id, limit: 25 },
    occurrencesSchema,
    "scheduler.occurrences"
  );
  useVisiblePolling(props.signal, result.refetch, !result.error);
  const errors = {
    "dispatch-failed": zh ? "派发失败" : "Dispatch failed",
    "execution-denied": zh ? "执行被拒绝" : "Execution denied",
    "job-expired": zh ? "任务已过期" : "Job expired",
    "dispatch-invalid": zh ? "派发输入无效" : "Invalid dispatch",
  };
  return (
    <section
      className="management-detail"
      aria-label={zh ? "触发记录" : "Occurrences"}
    >
      <div className="management-toolbar">
        <h3>{zh ? "触发记录" : "Occurrences"}</h3>
        <Button
          variant="secondary"
          disabled={result.blocking || result.refreshing}
          onClick={() => void refreshManagementRead(result)}
        >
          {zh ? "检查触发记录" : "Check occurrences"}
        </Button>
      </div>
      <p className="management-muted">
        {zh
          ? "预留触发记录不代表任务已执行。仅显示最近的有限记录。"
          : "A reserved occurrence is not evidence of execution. Only a bounded recent list is shown."}
      </p>
      <ReadState
        result={result}
        locale={props.environment.locale}
        isEmpty={result.data?.length === 0}
        empty={zh ? "没有可见触发记录。" : "No visible occurrences."}
      />
      {result.data && !result.error && (
        <ul className="management-list">
          {result.data.map((entry) => (
            <li className="management-row" key={entry.occurrence.id}>
              <div className="management-copy">
                <strong>
                  {scheduleTime(
                    entry.occurrence.scheduledAt,
                    props.environment.locale
                  )}
                </strong>
                <span>
                  {entry.occurrence.source === "manual"
                    ? zh
                      ? "手动触发"
                      : "Manual"
                    : zh
                      ? "定时触发"
                      : "Timer"}{" "}
                  ·{" "}
                  {
                    {
                      pending: zh ? "等待派发" : "Pending dispatch",
                      enqueued: zh ? "已入队" : "Enqueued",
                      blocked: zh ? "已阻止" : "Blocked",
                    }[entry.occurrence.state]
                  }
                </span>
                <span>
                  {entry.acceptance === "confirmed"
                    ? zh
                      ? "已确认接受"
                      : "Acceptance confirmed"
                    : zh
                      ? "接受情况未知"
                      : "Acceptance unknown"}
                </span>
                {entry.occurrence.error && (
                  <span>{errors[entry.occurrence.error]}</span>
                )}
                <span>
                  {entry.job
                    ? jobStateLabel(entry.job, zh)
                    : zh
                      ? "任务状态未知或未保留。"
                      : "Job state unknown or not retained."}
                </span>
                {entry.occurrence.jobId && (
                  <span className="management-muted">
                    {entry.occurrence.jobId}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type RevisionAction = "pause" | "resume" | "cancel";
type Confirmation = { action: RevisionAction; revision: number };
type TriggerSubmission = { key: string; unknown: boolean };

function ScheduleDetail({
  props,
  id,
  submissions,
}: {
  props: PageProps;
  id: string;
  submissions: Map<string, TriggerSubmission>;
}) {
  const zh = props.environment.locale === "zh-CN";
  const result = useManagementRead(
    props,
    "scheduler",
    "get",
    { id },
    scheduleSummarySchema,
    "scheduler.get"
  );
  const mutation = useManagementMutation(props);
  const client = useWorkspaceReadClient();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [conflict, setConflict] = useState(false);
  const [needsReconfirm, setNeedsReconfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [triggerUnknown, setTriggerUnknown] = useState(
    submissions.get(id)?.unknown ?? false
  );
  useVisiblePolling(
    props.signal,
    result.refetch,
    !result.error && !confirmation
  );
  const schedule = result.data;
  const labels = {
    pause: zh ? "暂停" : "Pause",
    resume: zh ? "恢复" : "Resume",
    cancel: zh ? "取消计划" : "Cancel schedule",
  };
  async function invalidate() {
    await Promise.all([
      client.invalidate({ key: "scheduler.list" }),
      client.invalidate({ key: "scheduler.get", params: { id } }),
      client.invalidate({ key: "scheduler.occurrences" }),
    ]);
  }
  async function revise() {
    if (
      mutation.pending ||
      !confirmation ||
      conflict ||
      needsReconfirm ||
      confirmation.revision !== schedule?.revision ||
      !hasOperation(props, "scheduler", confirmation.action)
    ) {
      return;
    }
    try {
      await mutation.run(async (signal) =>
        scheduleSummarySchema.parse(
          await props.services.invoke(
            "scheduler",
            confirmation.action,
            { id, revision: confirmation.revision },
            { signal }
          )
        )
      );
      setConfirmation(null);
      setNotice(zh ? "计划已更新。" : "Schedule updated.");
    } catch (error) {
      const changed = ["conflict", "CONFLICT"].includes(
        schedulerErrorCode(error) ?? ""
      );
      setConflict(true);
      setNeedsReconfirm(true);
      setNotice(
        changed
          ? zh
            ? "版本冲突。已保留操作，请重新读取计划并再次确认。"
            : "Revision conflict. Your action is preserved. Reload the schedule and confirm again."
          : zh
            ? "操作未确认。已保留操作，请重新读取状态后再决定。"
            : "The action was not confirmed. Your action is preserved. Reload the state before deciding again."
      );
      return;
    }
    await invalidate().catch(() =>
      setNotice(
        zh
          ? "计划已更新，但刷新失败。请重新读取计划。"
          : "Schedule updated, but refresh failed. Reload the schedule."
      )
    );
  }
  async function reload() {
    try {
      await result.refetch();
      setConflict(false);
    } catch {
      setNotice(
        zh
          ? "重新读取失败，操作已保留。"
          : "Reload failed. Your action is preserved."
      );
    }
  }
  async function trigger() {
    if (
      mutation.pending ||
      triggerUnknown ||
      !schedule ||
      !hasOperation(props, "scheduler", "trigger")
    ) {
      return;
    }
    const key = submissions.get(id)?.key ?? crypto.randomUUID();
    submissions.set(id, { key, unknown: true });
    try {
      const response = await mutation.run(async (signal) =>
        scheduleTriggerSchema.parse(
          await props.services.invoke(
            "scheduler",
            "trigger",
            { id, key },
            { signal }
          )
        )
      );
      submissions.delete(id);
      setNotice(
        zh
          ? `已预留触发记录 ${response.occurrenceId}，尚未确认执行。`
          : `Occurrence ${response.occurrenceId} reserved. Execution is not confirmed.`
      );
    } catch {
      setTriggerUnknown(true);
      setNotice(
        zh
          ? "触发结果未知。不会自动重试或发起另一次触发，请检查触发记录。"
          : "Trigger outcome unknown. No automatic retry or additional trigger will be sent. Check occurrences."
      );
      return;
    }
    await invalidate().catch(() =>
      setNotice(
        zh
          ? "已预留触发记录，但刷新失败。请检查触发记录。"
          : "Occurrence reserved, but refresh failed. Check occurrences."
      )
    );
  }
  return (
    <section
      className="management-detail"
      aria-label={zh ? "计划详情" : "Schedule details"}
    >
      <div className="management-toolbar">
        <h2>{zh ? "计划详情" : "Schedule details"}</h2>
        <Button
          variant="secondary"
          disabled={mutation.pending || result.blocking || result.refreshing}
          onClick={() => void reload()}
        >
          {zh ? "重新读取计划" : "Reload schedule"}
        </Button>
      </div>
      <ReadState result={result} locale={props.environment.locale} />
      {schedule && !result.error && (
        <>
          <dl className="management-meta">
            <dt>{zh ? "任务" : "Task"}</dt>
            <dd>{schedule.task}</dd>
            <dt>{zh ? "计划 ID" : "Schedule ID"}</dt>
            <dd>{schedule.id}</dd>
            <dt>{zh ? "状态" : "State"}</dt>
            <dd>{scheduleStateLabel(schedule.state, zh)}</dd>
            <dt>{zh ? "规则" : "Rule"}</dt>
            <dd>
              {scheduleRuleLabel(schedule.rule, props.environment.locale)}
            </dd>
            <dt>{zh ? "时区" : "Time zone"}</dt>
            <dd>
              {schedule.rule.kind === "cron"
                ? schedule.rule.timezone
                : zh
                  ? "固定时间点"
                  : "Fixed instant"}
            </dd>
            <dt>{zh ? "下次运行" : "Next run"}</dt>
            <dd>{scheduleTime(schedule.nextAt, props.environment.locale)}</dd>
            <dt>{zh ? "版本" : "Revision"}</dt>
            <dd>{schedule.revision}</dd>
          </dl>
          <div className="management-actions">
            {(["pause", "resume", "cancel"] satisfies RevisionAction[])
              .filter(
                (action) =>
                  hasOperation(props, "scheduler", action) &&
                  (action === "pause"
                    ? schedule.state === "active"
                    : action === "resume"
                      ? schedule.state === "paused"
                      : schedule.state !== "cancelled")
              )
              .map((action) => (
                <Button
                  key={action}
                  variant="secondary"
                  disabled={mutation.pending || conflict}
                  onClick={() => {
                    setConfirmation({ action, revision: schedule.revision });
                    setNeedsReconfirm(false);
                  }}
                >
                  {labels[action]}
                </Button>
              ))}
            {schedule.state !== "cancelled" &&
              hasOperation(props, "scheduler", "trigger") && (
                <Button
                  disabled={mutation.pending || triggerUnknown}
                  onClick={() => void trigger()}
                >
                  {zh ? "手动触发一次" : "Trigger once"}
                </Button>
              )}
          </div>
          {confirmation && (
            <fieldset
              className="management-notice"
              aria-label={zh ? "确认计划操作" : "Confirm schedule action"}
            >
              <p>
                {labels[confirmation.action]} · {zh ? "版本" : "Revision"}{" "}
                {confirmation.revision}
              </p>
              {confirmation.action === "cancel" && (
                <p>
                  {zh
                    ? "取消未来调度，不会取消已接受的任务或回滚外部操作。"
                    : "Cancels future scheduling, not accepted jobs or external effects."}
                </p>
              )}
              <div className="management-actions">
                {(needsReconfirm ||
                  confirmation.revision !== schedule.revision) && (
                  <Button
                    variant="secondary"
                    disabled={mutation.pending || conflict}
                    onClick={() => {
                      setConfirmation({
                        action: confirmation.action,
                        revision: schedule.revision,
                      });
                      setNeedsReconfirm(false);
                    }}
                  >
                    {zh ? "审阅最新版本" : "Review latest revision"}
                  </Button>
                )}
                <Button
                  disabled={
                    mutation.pending ||
                    conflict ||
                    needsReconfirm ||
                    confirmation.revision !== schedule.revision
                  }
                  onClick={() => void revise()}
                >
                  {zh ? "确认" : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={mutation.pending}
                  onClick={() => setConfirmation(null)}
                >
                  {zh ? "返回" : "Back"}
                </Button>
              </div>
              {confirmation.revision !== schedule.revision && (
                <p>
                  {zh
                    ? "版本已变化，请重新读取并再次确认。"
                    : "The revision changed. Reload and confirm again."}
                </p>
              )}
            </fieldset>
          )}
        </>
      )}
      {notice && (
        <p
          className="management-notice"
          role={conflict || triggerUnknown ? "alert" : "status"}
        >
          {notice}
        </p>
      )}
      {triggerUnknown && (
        <p className="management-notice">
          {zh
            ? "此计划有结果未知的手动触发。请检查触发记录，不会再次发送。"
            : "This schedule has a manual trigger with an unknown outcome. Check occurrences; it will not be sent again."}
        </p>
      )}
      {hasOperation(props, "scheduler", "occurrences") && (
        <Occurrences props={props} id={id} />
      )}
    </section>
  );
}

export default function SchedulerPage(props: PageProps) {
  const zh = props.environment.locale === "zh-CN";
  const [selected, setSelected] = useState<string | null>(null);
  const submissions = useRef(new Map<string, TriggerSubmission>());
  const result = useManagementRead(
    props,
    "scheduler",
    "list",
    { limit: 100 },
    scheduleListSchema,
    "scheduler.list"
  );
  useVisiblePolling(props.signal, result.refetch, !result.error);
  return (
    <ManagementFrame
      title={zh ? "调度" : "Scheduler"}
      description={
        zh
          ? "管理任务计划及触发记录。计划状态不代表任务执行结果。"
          : "Manage task schedules and occurrences. Schedule state is not a job execution result."
      }
      actions={
        <Button
          variant="secondary"
          disabled={result.blocking || result.refreshing}
          onClick={() => void refreshManagementRead(result)}
        >
          {zh ? "刷新" : "Refresh"}
        </Button>
      }
    >
      {hasOperation(props, "scheduler", "create") &&
        (hasOperation(props, "scheduler", "catalog") ? (
          <ScheduleCreation props={props} />
        ) : (
          <p className="management-notice">
            {zh
              ? "创建计划需要服务提供注册任务的输入模式。"
              : "Schedule creation requires registered task input schemas from the service."}
          </p>
        ))}
      <ReadState
        result={result}
        locale={props.environment.locale}
        isEmpty={result.data?.length === 0}
        empty={zh ? "没有可见计划。" : "No visible schedules."}
      />
      {result.data && !result.error && (
        <>
          <p className="management-muted">
            {zh
              ? "此列表有限，不代表所有计划。"
              : "This bounded list does not represent all schedules."}
          </p>
          <ul className="management-list">
            {result.data.map((schedule) => (
              <li key={schedule.id} className="management-row">
                <div className="management-copy">
                  <strong>{schedule.task}</strong>
                  <span>
                    {scheduleStateLabel(schedule.state, zh)} ·{" "}
                    {scheduleRuleLabel(schedule.rule, props.environment.locale)}
                  </span>
                  <span className="management-muted">
                    {zh ? "下次运行" : "Next run"}:{" "}
                    {scheduleTime(schedule.nextAt, props.environment.locale)}
                  </span>
                </div>
                {hasOperation(props, "scheduler", "get") && (
                  <Button
                    variant="ghost"
                    aria-label={`${zh ? "查看计划" : "View schedule"} ${schedule.id}`}
                    onClick={() => setSelected(schedule.id)}
                  >
                    {zh ? "查看" : "View"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {selected && (
        <ScheduleDetail
          key={selected}
          props={props}
          id={selected}
          submissions={submissions.current}
        />
      )}
    </ManagementFrame>
  );
}
