import { useInsertionEffect, useMemo } from "react";

import type { ConsoleActivation } from "./composition";

let sequence = 0;

/** An activation is a committed UI lease, never a persistent or authorization ID. */
export function useConsoleActivation(
  scope: unknown,
  parentSignal?: AbortSignal
) {
  const lifetime = useMemo(() => {
    sequence += 1;
    const controller = new AbortController();
    const state = { live: false };
    const activation: ConsoleActivation = {
      key: `console-activation-${sequence}`,
      isCurrent: () => state.live && !controller.signal.aborted,
    };
    return { scope, parentSignal, controller, state, activation };
  }, [scope, parentSignal]);
  useInsertionEffect(() => {
    const { controller, state, parentSignal: parent } = lifetime;
    const abort = () => controller.abort(parent?.reason);
    if (parent?.aborted) {
      abort();
    }
    state.live = !controller.signal.aborted;
    parent?.addEventListener("abort", abort, { once: true });
    return () => {
      state.live = false;
      parent?.removeEventListener("abort", abort);
      controller.abort();
    };
  }, [lifetime]);
  return {
    activation: lifetime.activation,
    signal: lifetime.controller.signal,
  };
}
