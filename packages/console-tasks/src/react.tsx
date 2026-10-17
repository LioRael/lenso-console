import {
  ConsolePageScope,
  useConsoleActivation,
  type ConsoleBinding,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";
import { Button } from "@lenso/ui/button";
import { Modal } from "@lenso/ui/modal";
import { Toolbar } from "@lenso/ui/toolbar";
import * as stylex from "@stylexjs/stylex";
import { ListTodo } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Job, Schedule, TaskClient } from "./client";

function TasksContent({
  services,
  activation,
  signal,
}: ConsoleLocalPageProps<TaskClient>) {
  const [page, setPage] = useState<{
    items: Job[];
    nextCursor: string | null;
  }>();
  const [schedules, setSchedules] = useState<Schedule[]>();
  const [error, setError] = useState("");
  const [scheduleError, setScheduleError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Job>();
  const [detailError, setDetailError] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<"retry" | "cancel">();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const cursorRef = useRef<string | undefined>(undefined);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const backButton = useRef<HTMLButtonElement | null>(null);
  const selectedId = selected?.jobId;
  useEffect(() => {
    if (selectedId && !busy) {
      (action ? backButton : closeButton).current?.focus();
    }
  }, [action, busy, selectedId]);
  const writeLock = useRef(false);
  const readVersion = useRef(0);
  const detailVersion = useRef(0);
  const current = useCallback(
    () => !signal.aborted && activation.isCurrent(),
    [signal, activation]
  );
  const load = useCallback(
    async (cursor?: string) => {
      cursorRef.current = cursor;
      readVersion.current += 1;
      const version = readVersion.current;
      setLoading(true);
      setError("");
      try {
        const data = await services.list(signal, cursor);
        if (current() && version === readVersion.current) {
          setPage(data);
        }
      } catch {
        if (current() && version === readVersion.current) {
          setError("Tasks could not be loaded. Try again.");
        }
      } finally {
        if (current() && version === readVersion.current) {
          setLoading(false);
        }
      }
    },
    [current, services, signal]
  );
  const loadSchedules = useCallback(async () => {
    setScheduleError(false);
    try {
      const data = await services.schedules?.(signal);
      if (current()) {
        setSchedules(data);
      }
    } catch {
      if (current()) {
        setScheduleError(true);
      }
    }
  }, [current, services, signal]);
  useEffect(() => {
    void load();
    void loadSchedules();
  }, [load, loadSchedules]);
  async function inspect(job: Job) {
    detailVersion.current += 1;
    const version = detailVersion.current;
    setSelected(job);
    setAction(undefined);
    setDetailError(false);
    setDetailLoading(true);
    setFeedback("");
    try {
      const data = await services.get(job.jobId, signal);
      if (current() && version === detailVersion.current) {
        setSelected(data);
        setPage((previous) =>
          previous
            ? {
                ...previous,
                items: previous.items.map((item) =>
                  item.jobId === data.jobId ? data : item
                ),
              }
            : previous
        );
      }
    } catch {
      if (current() && version === detailVersion.current) {
        setDetailError(true);
      }
    } finally {
      if (current() && version === detailVersion.current) {
        setDetailLoading(false);
      }
    }
  }
  async function execute() {
    if (
      !selected ||
      !action ||
      detailLoading ||
      detailError ||
      writeLock.current ||
      !current()
    ) {
      return;
    }
    const target = selected.jobId;
    const operation = action;
    writeLock.current = true;
    setBusy(true);
    setFeedback("");
    try {
      if (operation === "retry") {
        if (!services.retry || selected.state !== "failed") {
          return;
        }
        await services.retry(target, signal);
        if (current()) {
          setFeedback("Retry accepted. Execution has not yet completed.");
        }
      } else {
        if (
          !services.cancel ||
          !["pending", "running"].includes(selected.state)
        ) {
          return;
        }
        const outcome = await services.cancel(target, signal);
        if (current()) {
          setFeedback(
            outcome === "requested"
              ? "Cancellation requested. Running work may still finish."
              : outcome === "terminal"
                ? "Task already finished; no cancellation was applied."
                : "Task cancelled."
          );
        }
      }
      if (!current()) {
        return;
      }
      setAction(undefined);
      // Reconcile after an accepted write; read failures never imply that the write failed.
      try {
        const data = await services.get(target, signal);
        if (current()) {
          setSelected(data);
        }
      } catch {
        if (current()) {
          setDetailError(true);
        }
      }
      if (current()) {
        await load();
      }
    } catch {
      if (current()) {
        setAction(undefined);
        setFeedback(
          "Action could not be confirmed. Check current status before trying again; the request may have reached the server."
        );
        setDetailError(true);
      }
    } finally {
      writeLock.current = false;
      if (current()) {
        setBusy(false);
      }
    }
  }
  return (
    <main aria-label="Tasks" {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={activation.key}
        value={{ context: { kind: "object", label: "Tasks" } }}
      />
      <p>
        Authorized jobs from this queue. Times are shown in your local timezone.
      </p>
      {loading && <output>Loading tasks…</output>}
      {error && (
        <div role="alert">
          {error} {page && "Showing the last successful page."}{" "}
          <Button
            onClick={() => void load(cursorRef.current)}
            disabled={loading}
          >
            Try again
          </Button>
        </div>
      )}
      {page?.items.length === 0 && <p>No tasks on this page.</p>}
      <div {...stylex.props(styles.list)}>
        {page?.items.map((job) => (
          <section
            key={job.jobId}
            aria-label={job.task}
            {...stylex.props(styles.row)}
          >
            <h2>{job.task}</h2>
            <p>
              {job.state}
              {job.cancelRequested ? " · cancellation requested" : ""} · Attempt{" "}
              {job.attempt}/{job.maxAttempts}
            </p>
            <p>{job.jobId}</p>
            <Button variant="secondary" onClick={() => void inspect(job)}>
              View task
            </Button>
          </section>
        ))}
      </div>
      {(page?.nextCursor || cursorRef.current) && (
        <Toolbar
          isAttached
          aria-label="Task pagination"
          {...stylex.props(styles.pagination)}
        >
          {cursorRef.current && (
            <Toolbar.Button
              variant="secondary"
              disabled={loading}
              onClick={() => void load()}
            >
              First page
            </Toolbar.Button>
          )}
          {page?.nextCursor && (
            <Toolbar.Button
              variant="secondary"
              disabled={loading}
              onClick={() => void load(page.nextCursor!)}
            >
              Next page
            </Toolbar.Button>
          )}
        </Toolbar>
      )}
      {services.schedules && (
        <section aria-label="Schedules">
          <h2>Schedules</h2>
          <p>Up to 50 authorized schedules.</p>
          {scheduleError ? (
            <div role="alert">
              Schedules could not be loaded.{" "}
              <Button onClick={() => void loadSchedules()}>
                Try schedules again
              </Button>
            </div>
          ) : (
            !schedules && <output>Loading schedules…</output>
          )}
          {schedules?.length === 0 && <p>No schedules.</p>}
          {schedules?.map((schedule) => (
            <p key={schedule.id}>
              {schedule.task} · {schedule.state} · Next trigger:{" "}
              {schedule.nextAt === null
                ? "None"
                : new Date(schedule.nextAt).toLocaleString()}
            </p>
          ))}
        </section>
      )}
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !writeLock.current) {
            detailVersion.current += 1;
            setSelected(undefined);
            setAction(undefined);
          }
        }}
      >
        <Modal.Portal>
          <Modal.Backdrop />
          <Modal.Viewport>
            <Modal.Popup {...stylex.props(styles.modal)}>
              <Modal.Header>
                <Modal.Title>
                  {action
                    ? `${action === "retry" ? "Retry" : "Cancel"} task?`
                    : "Task details"}
                </Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Modal.Description>{selected?.task}</Modal.Description>
                <p {...stylex.props(styles.identifier)}>{selected?.jobId}</p>
                <p>
                  Status: {selected?.state}
                  {selected?.cancelRequested ? " · cancellation requested" : ""}
                </p>
                <p>
                  Attempts: {selected?.attempt}/{selected?.maxAttempts}
                </p>
                <p>
                  Next retry:{" "}
                  {["pending", "running"].includes(selected?.state ?? "")
                    ? "Not provided by the queue API"
                    : "Not scheduled"}
                </p>
                <p>
                  Error reason:{" "}
                  {selected?.failure ??
                    (detailLoading
                      ? "Loading…"
                      : detailError
                        ? "Unavailable"
                        : "None reported")}
                </p>
                {detailLoading && <output>Loading task details…</output>}
                {detailError && (
                  <div role="alert">
                    Current details are unavailable.{" "}
                    <Button
                      disabled={busy}
                      onClick={() => void inspect(selected!)}
                    >
                      Check status
                    </Button>
                  </div>
                )}
                {action && (
                  <p>
                    {action === "retry"
                      ? "Re-enqueue this failed task? The server checks replay safety before accepting."
                      : "Request cancellation? Running work may complete before cancellation takes effect."}
                  </p>
                )}
                {feedback && <output>{feedback}</output>}
                {busy && <output>Submitting…</output>}
              </Modal.Body>
              <Modal.Footer>
                <Toolbar
                  isAttached
                  aria-label="Task actions"
                  {...stylex.props(styles.actions)}
                >
                  {action ? (
                    <>
                      <Toolbar.Button
                        disabled={busy}
                        variant="secondary"
                        ref={backButton}
                        onClick={() => setAction(undefined)}
                      >
                        Back
                      </Toolbar.Button>
                      <Toolbar.Button
                        variant={action === "cancel" ? "danger" : "primary"}
                        disabled={busy || detailError || detailLoading}
                        onClick={() => void execute()}
                      >
                        Confirm {action}
                      </Toolbar.Button>
                    </>
                  ) : (
                    <>
                      {services.retry && selected?.state === "failed" && (
                        <Toolbar.Button
                          disabled={busy || detailLoading || detailError}
                          onClick={() => setAction("retry")}
                        >
                          Retry task
                        </Toolbar.Button>
                      )}
                      {services.cancel &&
                        selected &&
                        ["pending", "running"].includes(selected.state) &&
                        !selected.cancelRequested && (
                          <Toolbar.Button
                            variant="danger"
                            disabled={busy || detailLoading || detailError}
                            onClick={() => setAction("cancel")}
                          >
                            Cancel task
                          </Toolbar.Button>
                        )}
                      <Toolbar.Button
                        ref={closeButton}
                        disabled={busy}
                        onClick={() => {
                          detailVersion.current += 1;
                          setSelected(undefined);
                        }}
                      >
                        Close
                      </Toolbar.Button>
                    </>
                  )}
                </Toolbar>
              </Modal.Footer>
            </Modal.Popup>
          </Modal.Viewport>
        </Modal.Portal>
      </Modal>
    </main>
  );
}
export function TasksPage(props: ConsoleLocalPageProps<TaskClient>) {
  const lifetime = useConsoleActivation(props.services, props.signal);
  return (
    <TasksContent
      key={lifetime.activation.key}
      {...props}
      activation={lifetime.activation}
      signal={lifetime.signal}
    />
  );
}
export function tasksConsole(options: {
  id: string;
  route: string;
  client: TaskClient;
}): ConsoleBinding<TaskClient> {
  return {
    id: options.id,
    services: options.client,
    routes: { tasks: options.route },
    definition: {
      id: "console-tasks",
      pages: { tasks: { title: "Tasks", component: TasksPage } },
      navigation: [
        {
          id: "tasks",
          page: "tasks",
          label: "Tasks",
          icon: <ListTodo size={20} aria-hidden="true" />,
        },
      ],
    },
  };
}

const styles = stylex.create({
  page: { padding: 24, paddingBottom: 120, maxWidth: 1100, margin: "auto" },
  list: { display: "grid", gap: 12 },
  row: {
    borderBottom: "1px solid var(--separator)",
    paddingBlock: 12,
    overflowWrap: "anywhere",
  },
  pagination: { borderRadius: 999, width: "fit-content", marginTop: 12 },
  modal: { maxWidth: 540, width: "calc(100vw - 32px)" },
  identifier: { overflowWrap: "anywhere" },
  actions: { borderRadius: 999, flexWrap: "wrap" },
});
