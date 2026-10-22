import { Button } from "@lenso/ui/button";
import { Modal } from "@lenso/ui/modal";
import { Toolbar } from "@lenso/ui/toolbar";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Schedule, ScheduleAction, TaskClient } from "./client";

/** Schedules control future triggers. Queue jobs retain their separate lifecycle. */
export function SchedulePanel({
  services,
  signal,
  current,
  offline,
}: {
  services: TaskClient;
  signal: AbortSignal;
  current(): boolean;
  offline: boolean;
}) {
  const [items, setItems] = useState<Schedule[]>();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    schedule: Schedule;
    action: ScheduleAction;
  }>();
  const [uncertain, setUncertain] = useState<string>();
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  const epoch = useRef(0);
  const canWrite = !!services.getSchedule && !!services.changeSchedule;
  const read = useCallback(
    async (reconcile?: string) => {
      if (lock.current || !current()) {
        return;
      }
      epoch.current += 1;
      const version = epoch.current;
      setPending(true);
      setError(false);
      try {
        // Reconcile the exact uncertain target; absence from a bounded list is not proof.
        const checked =
          reconcile && services.getSchedule
            ? await services.getSchedule(reconcile, signal)
            : undefined;
        const page = await services.schedules!(signal);
        if (current() && version === epoch.current) {
          setItems(
            checked
              ? page.map((item) => (item.id === checked.id ? checked : item))
              : page
          );
          if (checked) {
            setUncertain(undefined);
            setFeedback(
              "Current schedule status checked. Review its revision before another action."
            );
          }
        }
      } catch {
        if (current() && version === epoch.current) {
          setError(true);
        }
      } finally {
        if (current() && version === epoch.current) {
          setPending(false);
        }
      }
    },
    [services, signal, current]
  );
  useEffect(() => {
    void read();
  }, [read]);
  async function execute() {
    const snapshot = confirmation;
    if (
      !snapshot ||
      lock.current ||
      pending ||
      uncertain ||
      offline ||
      !current() ||
      !services.changeSchedule
    ) {
      return;
    }
    lock.current = true;
    epoch.current += 1;
    setPending(true);
    setFeedback("");
    try {
      const result = await services.changeSchedule(
        snapshot.action,
        { id: snapshot.schedule.id, revision: snapshot.schedule.revision },
        signal
      );
      if (current()) {
        setItems((previous) =>
          previous?.map((item) => (item.id === result.id ? result : item))
        );
        setFeedback(
          "Schedule change confirmed. Already accepted jobs keep their own status."
        );
      }
    } catch {
      if (current()) {
        setUncertain(snapshot.schedule.id);
        setFeedback(
          "Change unconfirmed. Check schedule status before trying another action. The request may have committed."
        );
      }
    } finally {
      lock.current = false;
      if (current()) {
        setPending(false);
        setConfirmation(undefined);
      }
    }
  }
  return (
    <section aria-label="Schedules" {...stylex.props(styles.section)}>
      <h2>Schedules</h2>
      <p>
        Up to 50 authorized schedules. Cancelling a schedule stops future
        triggers; it does not cancel already accepted jobs.
      </p>
      {!canWrite && <p>Read-only host. Schedule controls are unavailable.</p>}
      {feedback && <output>{feedback}</output>}
      {error && (
        <p role="alert">
          Current schedule status is unavailable. Last known rows may be stale.
        </p>
      )}
      <Button
        variant="secondary"
        disabled={pending || offline}
        onClick={() => void read(uncertain)}
      >
        {uncertain ? "Check schedule status" : "Refresh schedules"}
      </Button>
      {pending && <output>Loading schedule status…</output>}
      {items?.length === 0 && <p>No schedules.</p>}
      {items?.map((schedule) => (
        <section
          key={schedule.id}
          aria-label={`Schedule ${schedule.task}`}
          {...stylex.props(styles.row)}
        >
          <h3>{schedule.task}</h3>
          <p>{schedule.id}</p>
          <p>
            Status: {schedule.state} · Revision: {schedule.revision} · Next
            trigger:{" "}
            {schedule.nextAt === null
              ? "None"
              : new Date(schedule.nextAt).toLocaleString()}
          </p>
          {canWrite && !["cancelled", "completed"].includes(schedule.state) && (
            <Toolbar
              isAttached
              aria-label={`Schedule actions ${schedule.task}`}
              {...stylex.props(styles.actions)}
            >
              <Toolbar.Button
                disabled={pending || offline || !!uncertain || error}
                onClick={() =>
                  setConfirmation({
                    schedule: { ...schedule },
                    action: schedule.state === "active" ? "pause" : "resume",
                  })
                }
              >
                {schedule.state === "active"
                  ? "Pause schedule"
                  : "Resume schedule"}
              </Toolbar.Button>
              <Toolbar.Button
                variant="danger"
                disabled={pending || offline || !!uncertain || error}
                onClick={() =>
                  setConfirmation({
                    schedule: { ...schedule },
                    action: "cancel",
                  })
                }
              >
                Cancel schedule
              </Toolbar.Button>
            </Toolbar>
          )}
        </section>
      ))}
      <Modal
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !lock.current) {
            setConfirmation(undefined);
          }
        }}
      >
        <Modal.Portal>
          <Modal.Backdrop />
          <Modal.Viewport>
            <Modal.Popup {...stylex.props(styles.modal)}>
              <Modal.Header>
                <Modal.Title>
                  Confirm {confirmation?.action} schedule
                </Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Modal.Description>
                  {confirmation?.schedule.task} · revision{" "}
                  {confirmation?.schedule.revision}
                </Modal.Description>
                <p {...stylex.props(styles.row)}>{confirmation?.schedule.id}</p>
                <p>
                  This changes future triggers only. Already accepted jobs may
                  continue. A revision conflict requires checking status again.
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setConfirmation(undefined)}
                >
                  Back
                </Button>
                <Button
                  disabled={pending || offline}
                  onClick={() => void execute()}
                >
                  Confirm schedule change
                </Button>
              </Modal.Footer>
            </Modal.Popup>
          </Modal.Viewport>
        </Modal.Portal>
      </Modal>
    </section>
  );
}
const styles = stylex.create({
  section: { marginTop: 24 },
  row: { paddingBlock: 12, overflowWrap: "anywhere" },
  actions: { flexWrap: "wrap" },
  modal: { maxWidth: 540, width: "calc(100vw - 32px)" },
});
