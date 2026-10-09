import { useWorkspaceReadClient, type PageProps } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import { TextField } from "@lenso/ui/textfield";
import { useMemo, useState } from "react";

import {
  ReadState,
  hasOperation,
  useManagementMutation,
  useManagementRead,
} from "../shared";
import {
  scheduleCreateSchema,
  schedulerCatalogSchema,
  scheduleSummarySchema,
  schedulerErrorCode,
} from "./schemas";
import {
  initialTaskInput,
  ScheduleSelect,
  TaskInputFields,
  taskInputModel,
} from "./task-input";

export function ScheduleCreation({ props }: { props: PageProps }) {
  const zh = props.environment.locale === "zh-CN";
  const catalog = useManagementRead(
    props,
    "scheduler",
    "catalog",
    {},
    schedulerCatalogSchema,
    "scheduler.catalog"
  );
  const mutation = useManagementMutation(props);
  const client = useWorkspaceReadClient();
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState("");
  const [input, setInput] = useState<unknown>(undefined);
  const [kind, setKind] = useState("once");
  const [at, setAt] = useState("");
  const [expression, setExpression] = useState("");
  const [timezone, setTimezone] = useState("");
  const [misfire, setMisfire] = useState("skip");
  const [graceMs, setGraceMs] = useState("0");
  const [notice, setNotice] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [reviewed, setReviewed] = useState(true);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const tasks = useMemo(
    () =>
      catalog.data?.tasks.map((entry) => ({
        name: entry.name,
        model:
          entry.schemaAvailability === "available"
            ? taskInputModel(entry.inputSchema)
            : null,
      })) ?? [],
    [catalog.data]
  );
  const model = tasks.find((entry) => entry.name === task)?.model;
  async function reloadCatalog() {
    try {
      await catalog.refetch();
      setNeedsReload(false);
      setReviewed(false);
    } catch {
      setNotice(
        zh
          ? "读取任务目录失败，草稿已保留。"
          : "Could not reload the task catalog. Your draft is preserved."
      );
    }
  }
  async function create() {
    if (
      mutation.pending ||
      !model ||
      needsReload ||
      !reviewed ||
      unknownOutcome ||
      !hasOperation(props, "scheduler", "create")
    ) {
      return;
    }
    const validatedInput = model.validator.safeParse(input);
    if (!validatedInput.success) {
      setNotice(
        zh
          ? "请检查任务输入字段，草稿已保留。"
          : "Check the task input fields. Your draft is preserved."
      );
      return;
    }
    if (kind === "cron") {
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone }).resolvedOptions();
      } catch {
        setNotice(
          zh ? "请输入有效的 IANA 时区。" : "Enter a valid IANA time zone."
        );
        return;
      }
    }
    const definition = scheduleCreateSchema.safeParse({
      task,
      input: validatedInput.data,
      rule:
        kind === "once"
          ? { kind, at: Date.parse(at) }
          : { kind, expression: expression.trim(), timezone: timezone.trim() },
      misfire,
      graceMs: graceMs === "" ? undefined : Number(graceMs),
    });
    if (
      !definition.success ||
      (kind === "cron" && (!expression.trim() || !timezone.trim()))
    ) {
      setNotice(
        zh
          ? "请检查计划规则和宽限时间。"
          : "Check the schedule rule and grace period."
      );
      return;
    }
    try {
      await mutation.run(async (signal) =>
        scheduleSummarySchema.parse(
          await props.services.invoke("scheduler", "create", definition.data, {
            signal,
          })
        )
      );
      setNotice(zh ? "计划已创建。" : "Schedule created.");
      setOpen(false);
      setTask("");
      setInput(undefined);
      setAt("");
      setExpression("");
      setTimezone("");
    } catch (error) {
      const code = schedulerErrorCode(error);
      if (code === "conflict" || code === "CONFLICT") {
        setNeedsReload(true);
        setReviewed(false);
        setNotice(
          zh
            ? "创建冲突，草稿已保留。重新读取目录并审阅草稿后再确认。"
            : "Creation conflict. Your draft is preserved. Reload the catalog, review your draft, and confirm again."
        );
      } else if (
        [
          "invalid-input",
          "UNPROCESSABLE_CONTENT",
          "forbidden",
          "FORBIDDEN",
        ].includes(code ?? "")
      ) {
        setNotice(
          code === "forbidden" || code === "FORBIDDEN"
            ? zh
              ? "没有创建此计划的权限，草稿已保留。"
              : "You cannot create this schedule. Your draft is preserved."
            : zh
              ? "服务拒绝了计划输入，请检查字段。草稿已保留。"
              : "The service rejected the schedule input. Check the fields. Your draft is preserved."
        );
      } else {
        setUnknownOutcome(true);
        setNotice(
          zh
            ? "创建结果未知，草稿已保留。不会再次发送，请刷新计划列表确认。"
            : "Creation outcome unknown. Your draft is preserved. It will not be sent again. Refresh the schedule list to check."
        );
      }
      return;
    }
    await client
      .invalidate({ key: "scheduler.list" })
      .catch(() =>
        setNotice(
          zh
            ? "计划已创建，但刷新失败。请刷新计划列表。"
            : "Schedule created, but refresh failed. Refresh the schedule list."
        )
      );
  }
  return (
    <section
      className="management-detail"
      aria-label={zh ? "创建计划" : "Create schedule"}
    >
      <Button
        disabled={mutation.pending}
        onClick={() => setOpen((current) => !current)}
        variant={open ? "secondary" : undefined}
      >
        {open
          ? zh
            ? "收起创建表单"
            : "Hide creation form"
          : zh
            ? "创建计划"
            : "Create schedule"}
      </Button>
      {open && (
        <>
          <h2>{zh ? "创建计划" : "Create schedule"}</h2>
          <ReadState
            result={catalog}
            locale={props.environment.locale}
            isEmpty={catalog.data?.tasks.length === 0}
            empty={
              zh
                ? "没有已授权的注册任务，无法创建计划。"
                : "No authorized registered tasks are available for schedule creation."
            }
          />
          {catalog.data && !catalog.error && catalog.data.tasks.length > 0 && (
            <form
              className="management-form"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <ScheduleSelect
                label={zh ? "注册任务" : "Registered task"}
                value={task || null}
                options={tasks.map((entry) => ({
                  value: entry.name,
                  label: entry.name,
                }))}
                disabled={mutation.pending || unknownOutcome}
                required
                onChange={(name) => {
                  setTask(name);
                  const next = tasks.find(
                    (entry) => entry.name === name
                  )?.model;
                  setInput(next ? initialTaskInput(next) : undefined);
                }}
              />
              {task && !model && (
                <p className="management-notice">
                  {zh
                    ? "此任务的输入模式不可用或不受表单支持，无法在此创建计划。"
                    : "This task's input schema is unavailable or unsupported by the form. Schedule creation is disabled for this task."}
                </p>
              )}
              {model && (
                <TaskInputFields
                  key={task}
                  model={model}
                  value={input}
                  onChange={setInput}
                  name={zh ? "任务输入" : "Task input"}
                  zh={zh}
                  disabled={mutation.pending || unknownOutcome}
                />
              )}
              <ScheduleSelect
                label={zh ? "规则类型" : "Rule type"}
                value={kind}
                options={[
                  { value: "once", label: zh ? "单次" : "Once" },
                  { value: "cron", label: zh ? "Cron 定时" : "Cron" },
                ]}
                onChange={setKind}
                disabled={mutation.pending || unknownOutcome}
              />
              {kind === "once" ? (
                <label className="management-field">
                  {zh ? "运行时间（本地时区）" : "Run at (local time zone)"}
                  <TextField.Root>
                    <Input
                      type="datetime-local"
                      required
                      value={at}
                      disabled={mutation.pending || unknownOutcome}
                      onChange={(event) => setAt(event.target.value)}
                    />
                  </TextField.Root>
                </label>
              ) : (
                <>
                  <label className="management-field">
                    {zh ? "Cron 表达式" : "Cron expression"}
                    <TextField.Root>
                      <Input
                        required
                        maxLength={256}
                        value={expression}
                        disabled={mutation.pending || unknownOutcome}
                        onChange={(event) => setExpression(event.target.value)}
                      />
                    </TextField.Root>
                  </label>
                  <label className="management-field">
                    {zh ? "IANA 时区" : "IANA time zone"}
                    <TextField.Root>
                      <Input
                        required
                        maxLength={256}
                        value={timezone}
                        placeholder="Area/Location"
                        disabled={mutation.pending || unknownOutcome}
                        onChange={(event) => setTimezone(event.target.value)}
                      />
                    </TextField.Root>
                  </label>
                </>
              )}
              <ScheduleSelect
                label={zh ? "错过运行时" : "Misfire policy"}
                value={misfire}
                options={[
                  { value: "skip", label: zh ? "跳过" : "Skip" },
                  { value: "coalesce", label: zh ? "合并为一次" : "Coalesce" },
                ]}
                onChange={setMisfire}
                disabled={mutation.pending || unknownOutcome}
              />
              <label className="management-field">
                {zh ? "宽限时间（毫秒）" : "Grace period (milliseconds)"}
                <TextField.Root>
                  <Input
                    type="number"
                    required
                    min={0}
                    max={86_400_000}
                    step={1}
                    value={graceMs}
                    disabled={mutation.pending || unknownOutcome}
                    onChange={(event) => setGraceMs(event.target.value)}
                  />
                </TextField.Root>
              </label>
              <div className="management-actions">
                {needsReload && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={mutation.pending || catalog.refreshing}
                    onClick={() => void reloadCatalog()}
                  >
                    {zh ? "重新读取任务目录" : "Reload task catalog"}
                  </Button>
                )}
                {!needsReload && !reviewed && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={mutation.pending}
                    onClick={() => setReviewed(true)}
                  >
                    {zh ? "草稿已审阅" : "Draft reviewed"}
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={
                    mutation.pending ||
                    !model ||
                    needsReload ||
                    !reviewed ||
                    unknownOutcome
                  }
                >
                  {zh ? "确认创建" : "Confirm creation"}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
      {notice && <output className="management-notice">{notice}</output>}
    </section>
  );
}
