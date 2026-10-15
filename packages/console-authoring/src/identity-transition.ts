// Cookie writes share one origin-wide lock; notifications carry no identity data.
export const identityTransitionLock = "lenso.identity-transition";
const eventName = "lenso-identity-transition";
const workspaceEventName = "lenso-workspace-identity-transition";
type Phase = "begin" | "complete";
function notificationChannel(name: string) {
  try {
    return typeof window !== "undefined" &&
      typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(name)
      : undefined;
  } catch {
    return undefined;
  }
}
const channel = notificationChannel(eventName);

const broadcast = channel?.postMessage.bind(channel);
const workspaceChannel = notificationChannel(workspaceEventName);
const workspaceBroadcast = workspaceChannel?.postMessage.bind(workspaceChannel);

function notify(phase: Phase) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: phase }));
  try {
    broadcast?.(phase);
  } catch {
    /* Notification is best-effort, not authorization. */
  }
}

export async function withIdentityTransition<T>(
  work: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  return transition(work, notify, signal);
}

/** Check current deadlines under the existing cookie-write lock before retiring providers. */
export async function withConditionalIdentityTransition(
  needed: () => Promise<boolean>,
  work: () => Promise<void>,
  signal: AbortSignal
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return false;
  }
  return navigator.locks.request(
    identityTransitionLock,
    { signal },
    async () => {
      signal.throwIfAborted();
      if (!(await needed())) {
        return false;
      }
      try {
        signal.throwIfAborted();
        notify("begin");
        await work();
        return true;
      } finally {
        notify("complete");
      }
    }
  );
}

// Same cookie-write lock, separate notification: exchanging an operator cookie
// must retire operator providers without signing the ordinary account out.
export function withWorkspaceIdentityTransition<T>(
  work: () => Promise<T>,
  sourceId: string
) {
  return transition(work, (phase) => {
    const detail = { phase, sourceId };
    window.dispatchEvent(new CustomEvent(workspaceEventName, { detail }));
    try {
      workspaceBroadcast?.(detail);
    } catch {
      /* The local transition still completes. */
    }
  });
}

async function transition<T>(
  work: () => Promise<T>,
  publish: (phase: Phase) => void,
  signal?: AbortSignal
) {
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error("This browser cannot safely switch identities.");
  }
  return navigator.locks.request(
    identityTransitionLock,
    signal ? { signal } : {},
    async () => {
      try {
        signal?.throwIfAborted();
        publish("begin");
        return await work();
      } finally {
        publish("complete");
      }
    }
  );
}

export function withIdentityRead<T>(
  work: () => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  return typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request(
        identityTransitionLock,
        { mode: "shared", signal },
        work
      )
    : work();
}

export function subscribeIdentityTransitions(
  onChange: (phase: Phase, remote: boolean) => void
) {
  return subscribe(eventName, channel, onChange);
}

export function subscribeWorkspaceIdentityTransitions(
  onChange: (phase: Phase, sourceId: string) => void
) {
  const receive = (value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      "phase" in value &&
      "sourceId" in value &&
      (value.phase === "begin" || value.phase === "complete") &&
      typeof value.sourceId === "string" &&
      /^[a-z][a-z0-9._-]{0,63}$/u.test(value.sourceId)
    ) {
      onChange(value.phase, value.sourceId);
    }
  };
  const local = (event: Event) =>
    receive((event as CustomEvent<unknown>).detail);
  const remote = (event: MessageEvent<unknown>) => receive(event.data);
  window.addEventListener(workspaceEventName, local);
  workspaceChannel?.addEventListener("message", remote);
  return () => {
    window.removeEventListener(workspaceEventName, local);
    workspaceChannel?.removeEventListener("message", remote);
  };
}

function subscribe(
  name: string,
  source: BroadcastChannel | undefined,
  onChange: (phase: Phase, remote: boolean) => void
) {
  const local = (event: Event) => {
    const phase = (event as CustomEvent<unknown>).detail;
    if (phase === "begin" || phase === "complete") {
      onChange(phase, false);
    }
  };
  window.addEventListener(name, local);
  const remote = ({ data }: MessageEvent<unknown>) => {
    if (data === "begin" || data === "complete") {
      onChange(data, true);
    }
  };
  source?.addEventListener("message", remote);
  return () => {
    window.removeEventListener(name, local);
    source?.removeEventListener("message", remote);
  };
}
