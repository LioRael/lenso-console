const foreground = () => document.visibilityState !== "hidden";
/** Server-owned deadlines. These hints never authorize a request or revive a session. */
export interface SessionRenewalStatus {
  subjectId: string;
  serverNow: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  renewAfterAt: number;
}
export function parseSessionRenewalStatus(
  value: unknown
): SessionRenewalStatus {
  if (!value || typeof value !== "object") {
    throw new TypeError("Session deadlines unavailable");
  }
  const v = value as Record<string, unknown>;
  if (
    typeof v.subjectId !== "string" ||
    !v.subjectId ||
    ![v.serverNow, v.expiresAt, v.absoluteExpiresAt, v.renewAfterAt].every(
      (x) => Number.isSafeInteger(x) && (x as number) >= 0
    ) ||
    (v.expiresAt as number) > (v.absoluteExpiresAt as number)
  ) {
    throw new TypeError("Session deadlines invalid");
  }
  return {
    subjectId: v.subjectId,
    serverNow: v.serverNow as number,
    expiresAt: v.expiresAt as number,
    absoluteExpiresAt: v.absoluteExpiresAt as number,
    renewAfterAt: v.renewAfterAt as number,
  };
}
/** Rolling idle renewal follows the server minimum; withinMs optionally limits it to near expiry. */
export function sessionRenewalDue(
  status: SessionRenewalStatus,
  withinMs?: number
) {
  return (
    status.serverNow < status.expiresAt &&
    status.expiresAt < status.absoluteExpiresAt &&
    status.serverNow >= status.renewAfterAt &&
    (withinMs === undefined || status.expiresAt - status.serverNow <= withinMs)
  );
}
/** Foreground and recently active only. No interval polling or credentials in browser storage. */
export function startSessionRenewal(options: {
  status(): Promise<SessionRenewalStatus>;
  renew(): Promise<void>;
  unavailable(error: unknown): void;
  signal: AbortSignal;
}) {
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastActivity = Date.now();
  let lastCheck = 0;
  let snapshot: { status: SessionRenewalStatus; at: number } | undefined;
  const stopTimer = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = undefined;
  };
  function schedule() {
    stopTimer();
    if (!snapshot || !foreground() || options.signal.aborted) {
      return;
    }
    const s = snapshot.status;
    const at = Date.now();
    const serverNow = s.serverNow + at - snapshot.at;
    const due =
      s.expiresAt < s.absoluteExpiresAt
        ? Math.min(s.renewAfterAt, s.expiresAt)
        : s.expiresAt;
    timer = setTimeout(() => void check(true), Math.max(1000, due - serverNow));
  }
  async function check(force = false) {
    if (
      inFlight ||
      !foreground() ||
      options.signal.aborted ||
      Date.now() - lastActivity > 120_000
    ) {
      return;
    }
    if (
      !force &&
      Date.now() - lastCheck < 30_000 &&
      !(
        snapshot &&
        snapshot.status.expiresAt <=
          snapshot.status.serverNow + Date.now() - snapshot.at
      )
    ) {
      return;
    }
    if (snapshot && !force) {
      const s = snapshot.status,
        serverNow = s.serverNow + Date.now() - snapshot.at;
      if (
        serverNow <
        (s.expiresAt < s.absoluteExpiresAt
          ? Math.min(s.renewAfterAt, s.expiresAt)
          : s.expiresAt)
      ) {
        schedule();
        return;
      }
    }
    inFlight = true;
    lastCheck = Date.now();
    stopTimer();
    try {
      const status = await options.status();
      options.signal.throwIfAborted();
      snapshot = { status, at: Date.now() };
      if (status.expiresAt <= status.serverNow) {
        throw new Error("Session expired");
      }
      if (sessionRenewalDue(status)) {
        await options.renew();
        options.signal.throwIfAborted();
        snapshot = { status: await options.status(), at: Date.now() };
      }
      // No repeated deadline writes at the absolute cap or after a failed renewal.
      schedule();
    } catch (error) {
      if (!options.signal.aborted) {
        options.unavailable(error);
      }
    } finally {
      inFlight = false;
    }
  }
  const activity = () => {
    lastActivity = Date.now();
    void check();
  };
  const visibility = () => {
    if (foreground()) {
      lastActivity = Date.now();
      void check(true);
    } else {
      stopTimer();
    }
  };
  const events = ["pointerdown", "keydown", "scroll", "focus"] as const;
  for (const name of events) {
    // Element scroll does not bubble; capture includes activity inside nested panes.
    window.addEventListener(name, activity, {
      passive: true,
      capture: name === "scroll",
    });
  }
  document.addEventListener("visibilitychange", visibility);
  const close = () => {
    stopTimer();
    for (const name of events) {
      window.removeEventListener(name, activity, name === "scroll");
    }
    document.removeEventListener("visibilitychange", visibility);
  };
  options.signal.addEventListener("abort", close, { once: true });
  void check(true);
  return close;
}
