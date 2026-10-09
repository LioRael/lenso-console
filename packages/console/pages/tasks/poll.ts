import { useEffect, useLayoutEffect, useRef } from "react";

/** One bounded read at a time, suspended while the document is hidden. */
export function useVisiblePolling(
  signal: AbortSignal,
  refetch: () => Promise<void>,
  enabled = true
) {
  const latest = useRef(refetch);
  useLayoutEffect(() => {
    latest.current = refetch;
  }, [refetch]);
  useEffect(() => {
    if (!enabled || signal.aborted) {
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    function stop() {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = undefined;
    }
    function schedule() {
      stop();
      if (!disposed && !signal.aborted && !document.hidden && !running) {
        timer = setTimeout(() => void refresh(), 10_000);
      }
    }
    async function refresh() {
      if (disposed || signal.aborted || document.hidden || running) {
        return;
      }
      running = true;
      try {
        await latest.current();
      } catch {
        // The scoped read owns the visible error and its recovery action.
      } finally {
        running = false;
        schedule();
      }
    }
    function visibility() {
      if (document.hidden) {
        stop();
      } else {
        schedule();
      }
    }
    function abort() {
      disposed = true;
      stop();
    }
    document.addEventListener("visibilitychange", visibility);
    signal.addEventListener("abort", abort, { once: true });
    schedule();
    return () => {
      abort();
      document.removeEventListener("visibilitychange", visibility);
      signal.removeEventListener("abort", abort);
    };
  }, [signal, enabled]);
}
