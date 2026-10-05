// Cookie writes share one origin-wide lock; notifications carry no identity data.
export const identityTransitionLock = "lenso.identity-transition";
const eventName = "lenso-identity-transition";
type Phase = "begin" | "complete";
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(eventName)
    : undefined;

const broadcast = channel?.postMessage.bind(channel);

function notify(phase: Phase) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: phase }));
  broadcast?.(phase);
}

export async function withIdentityTransition<T>(
  work: () => Promise<T>
): Promise<T> {
  if (!navigator.locks || !channel) {
    throw new Error("This browser cannot safely switch identities.");
  }
  return navigator.locks.request(identityTransitionLock, async () => {
    try {
      notify("begin");
      return await work();
    } finally {
      notify("complete");
    }
  });
}

export function withIdentityRead<T>(
  work: () => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  return navigator.locks
    ? navigator.locks.request(
        identityTransitionLock,
        { mode: "shared", signal },
        work
      )
    : work();
}

export function subscribeIdentityTransitions(onChange: (phase: Phase) => void) {
  const local = (event: Event) => {
    const phase = (event as CustomEvent<unknown>).detail;
    if (phase === "begin" || phase === "complete") {
      onChange(phase);
    }
  };
  window.addEventListener(eventName, local);
  const remote = ({ data }: MessageEvent<unknown>) => {
    if (data === "begin" || data === "complete") {
      onChange(data);
    }
  };
  channel?.addEventListener("message", remote);
  return () => {
    window.removeEventListener(eventName, local);
    channel?.removeEventListener("message", remote);
  };
}
