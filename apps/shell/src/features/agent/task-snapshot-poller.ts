type TaskSnapshotPollerOptions<Snapshot> = {
  deliver: (snapshot: Snapshot) => void;
  read: (signal: AbortSignal) => Promise<Snapshot>;
  schedule: (poll: () => void) => () => void;
};

export function createTaskSnapshotPoller<Snapshot>({
  deliver,
  read,
  schedule,
}: TaskSnapshotPollerOptions<Snapshot>) {
  const controller = new AbortController();
  let cancelled = false;
  let cancelScheduledPoll: (() => void) | undefined;

  const poll = async () => {
    try {
      const snapshot = await read(controller.signal);
      if (!(cancelled || controller.signal.aborted)) {
        deliver(snapshot);
      }
    } catch {
      // A Task Supervisor may be unavailable in the selected Generation.
    } finally {
      if (!(cancelled || controller.signal.aborted)) {
        cancelScheduledPoll = schedule(() => void poll());
      }
    }
  };

  return {
    cancel() {
      cancelled = true;
      controller.abort();
      cancelScheduledPoll?.();
    },
    start() {
      void poll();
    },
  };
}
