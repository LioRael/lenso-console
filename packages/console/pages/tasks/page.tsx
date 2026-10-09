import { useWorkspaceReadClient, type PageProps } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { useState } from "react";

import {
  ManagementFrame,
  ReadState,
  hasOperation,
  managementErrorMessage,
  refreshManagementRead,
  useManagementMutation,
  useManagementRead,
} from "../shared";
import { useVisiblePolling } from "./poll";
import {
  jobDetailSchema,
  taskCancelSchema,
  taskListSchema,
  taskRetrySchema,
  type JobSummary,
} from "./schemas";

export function jobStateLabel(job: JobSummary, zh: boolean) {
  const states = {
    pending: zh ? "等待中" : "Pending",
    running: zh ? "运行中" : "Running",
    succeeded: zh ? "已成功" : "Succeeded",
    failed: zh ? "已失败" : "Failed",
    cancelled: zh ? "已取消" : "Cancelled",
  };
  return job.cancelRequested &&
    (job.state === "running" || job.state === "pending")
    ? `${states[job.state]} (${zh ? "已请求取消" : "cancellation requested"})`
    : states[job.state];
}

function TaskDetail({ props, jobId }: { props: PageProps; jobId: string }) {
  const zh = props.environment.locale === "zh-CN";
  const result = useManagementRead(
    props,
    "tasks",
    "get",
    { jobId },
    jobDetailSchema,
    "tasks.get"
  );
  const mutation = useManagementMutation(props);
  const client = useWorkspaceReadClient();
  const [confirmation, setConfirmation] = useState<"retry" | "cancel" | null>(
    null
  );
  const [notice, setNotice] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  useVisiblePolling(props.signal, result.refetch, !result.error);
  const job = result.data;
  async function perform(operation: "retry" | "cancel") {
    if (
      mutation.pending ||
      needsReload ||
      !job ||
      !hasOperation(props, "tasks", operation)
    ) {
      return;
    }
    setNotice("");
    try {
      const response = await mutation.run(async (signal) => {
        const raw = await props.services.invoke(
          "tasks",
          operation,
          { jobId },
          { signal }
        );
        return operation === "retry"
          ? taskRetrySchema.parse(raw)
          : taskCancelSchema.parse(raw);
      });
      setConfirmation(null);
      setNotice(
        "retried" in response
          ? response.retried
            ? zh
              ? "已接受重试。"
              : "Retry accepted."
            : zh
              ? "未重试。"
              : "Job was not retried."
          : response.outcome === "requested"
            ? zh
              ? "已请求取消，任务仍可能运行。"
              : "Cancellation requested. The job may still be running."
            : response.outcome === "cancelled"
              ? zh
                ? "任务已取消。"
                : "Job cancelled."
              : zh
                ? "任务状态已变化，请查看最新状态。"
                : "The job state changed. Review its current state."
      );
    } catch (error) {
      setConfirmation(null);
      setNeedsReload(true);
      setNotice(managementErrorMessage(error, props.environment.locale));
      return;
    }
    await Promise.all([
      client.invalidate({ key: "tasks.list" }),
      client.invalidate({ key: "tasks.get", params: { jobId } }),
    ]).catch(() => {
      setNeedsReload(true);
      setNotice(
        zh
          ? "操作已确认，但刷新失败。请刷新任务状态。"
          : "The action was confirmed, but refresh failed. Refresh the job state."
      );
    });
  }
  async function reload() {
    try {
      await result.refetch();
      setNeedsReload(false);
    } catch {
      setNotice(
        zh
          ? "刷新任务状态失败，请稍后再试。"
          : "Could not refresh the job state. Try again later."
      );
    }
  }
  const canRetry =
    job?.state === "failed" && hasOperation(props, "tasks", "retry");
  const canCancel =
    job &&
    ["pending", "running"].includes(job.state) &&
    !job.cancelRequested &&
    hasOperation(props, "tasks", "cancel");
  return (
    <section
      className="management-detail"
      aria-label={zh ? "任务详情" : "Job details"}
    >
      <div className="management-toolbar">
        <h2>{zh ? "任务详情" : "Job details"}</h2>
        <Button
          variant="secondary"
          disabled={mutation.pending || result.blocking || result.refreshing}
          onClick={() => void reload()}
        >
          {zh ? "重新读取任务" : "Reload job"}
        </Button>
      </div>
      <ReadState result={result} locale={props.environment.locale} />
      {job && !result.error && (
        <>
          <dl className="management-meta">
            <dt>{zh ? "任务" : "Task"}</dt>
            <dd>{job.task}</dd>
            <dt>{zh ? "任务 ID" : "Job ID"}</dt>
            <dd>{job.jobId}</dd>
            <dt>{zh ? "状态" : "State"}</dt>
            <dd>{jobStateLabel(job, zh)}</dd>
            <dt>{zh ? "尝试次数" : "Attempts"}</dt>
            <dd>
              {job.attempt} / {job.maxAttempts}
            </dd>
          </dl>
          {job.state === "failed" && (
            <p className="management-muted">
              {zh ? "失败摘要" : "Failure summary"}:{" "}
              {job.failure ?? (zh ? "未提供" : "Unavailable")}.{" "}
              {zh
                ? "不会显示原始错误或任务输入。"
                : "Raw errors and task inputs are not displayed."}
            </p>
          )}
          <div className="management-actions">
            {canRetry && (
              <Button
                disabled={mutation.pending || needsReload}
                onClick={() => setConfirmation("retry")}
              >
                {zh ? "重试任务" : "Retry job"}
              </Button>
            )}
            {canCancel && (
              <Button
                disabled={mutation.pending || needsReload}
                variant="secondary"
                onClick={() => setConfirmation("cancel")}
              >
                {zh ? "取消任务" : "Cancel job"}
              </Button>
            )}
          </div>
          {confirmation &&
            ((confirmation === "retry" && canRetry) ||
              (confirmation === "cancel" && canCancel)) && (
              <fieldset
                className="management-notice"
                aria-label={zh ? "确认操作" : "Confirm action"}
              >
                <p>
                  {confirmation === "retry"
                    ? zh
                      ? "重试此失败任务？服务端将检查重放安全性。"
                      : "Retry this failed job? The server will check replay safety."
                    : zh
                      ? "请求取消此任务？运行中的外部操作可能已生效。"
                      : "Request cancellation? Running external operations may already have taken effect."}
                </p>
                <div className="management-actions">
                  <Button
                    disabled={mutation.pending || needsReload}
                    onClick={() => void perform(confirmation)}
                  >
                    {zh ? "确认" : "Confirm"}
                  </Button>
                  <Button
                    disabled={mutation.pending}
                    variant="ghost"
                    onClick={() => setConfirmation(null)}
                  >
                    {zh ? "返回" : "Back"}
                  </Button>
                </div>
              </fieldset>
            )}
        </>
      )}
      {notice && (
        <p
          role={needsReload ? "alert" : "status"}
          className="management-notice"
        >
          {notice}
        </p>
      )}
    </section>
  );
}

export default function TasksPage(props: PageProps) {
  const zh = props.environment.locale === "zh-CN";
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const cursor = cursors.at(-1);
  const result = useManagementRead(
    props,
    "tasks",
    "list",
    cursor ? { limit: 25, cursor } : { limit: 25 },
    taskListSchema,
    "tasks.list"
  );
  useVisiblePolling(props.signal, result.refetch, !result.error);
  return (
    <ManagementFrame
      title={zh ? "任务" : "Tasks"}
      description={
        zh
          ? "查看已授权任务的状态，重试失败任务或请求取消。"
          : "Review authorized jobs, retry failures, or request cancellation."
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
      <ReadState
        result={result}
        locale={props.environment.locale}
        isEmpty={result.data?.items.length === 0}
        empty={
          result.data?.nextCursor
            ? zh
              ? "此页没有可见任务，仍可继续下一页。"
              : "No visible jobs on this page. You can continue to the next page."
            : zh
              ? "没有可见任务。任务提交后会在此显示。"
              : "No visible jobs. Jobs appear here after they are submitted."
        }
      />
      {result.data && !result.error && (
        <>
          <ul className="management-list">
            {result.data.items.map((job) => (
              <li key={job.jobId} className="management-row">
                <div className="management-copy">
                  <strong>{job.task}</strong>
                  <span>{jobStateLabel(job, zh)}</span>
                  <span className="management-muted">{job.jobId}</span>
                </div>
                {hasOperation(props, "tasks", "get") && (
                  <Button
                    variant="ghost"
                    aria-label={`${zh ? "查看任务" : "View job"} ${job.jobId}`}
                    onClick={() => setSelected(job.jobId)}
                  >
                    {zh ? "查看" : "View"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div
            className="management-pagination"
            aria-label={zh ? "分页" : "Pagination"}
          >
            <Button
              variant="secondary"
              disabled={!cursors.length || result.blocking || result.refreshing}
              onClick={() => {
                setCursors((current) => current.slice(0, -1));
                setSelected(null);
              }}
            >
              {zh ? "上一页" : "Previous"}
            </Button>
            <Button
              variant="secondary"
              disabled={
                !result.data.nextCursor || result.blocking || result.refreshing
              }
              onClick={() => {
                const next = result.data?.nextCursor;
                if (next) {
                  setCursors((current) => [...current, next]);
                  setSelected(null);
                }
              }}
            >
              {zh ? "下一页" : "Next"}
            </Button>
          </div>
        </>
      )}
      {selected && <TaskDetail key={selected} props={props} jobId={selected} />}
    </ManagementFrame>
  );
}
