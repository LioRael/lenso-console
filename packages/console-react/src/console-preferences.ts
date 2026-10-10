import { useEffect, useInsertionEffect, useRef, useState } from "react";

import type {
  ConsolePreferences,
  ConsolePreferenceSnapshot,
  ConsolePreferenceStore,
} from "./composition";
import { consolePositions, consoleReferenceKey } from "./console-model";

export function projectConsolePreferenceSnapshot(
  input: unknown
): ConsolePreferenceSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Invalid Console preference snapshot");
  }
  const snapshot = input as Record<string, unknown>;
  if (
    typeof snapshot.revision !== "string" ||
    snapshot.revision.length > 2048
  ) {
    throw new TypeError("Invalid Console preference revision");
  }
  if (snapshot.value === null) {
    return { revision: snapshot.revision, value: null };
  }
  if (
    !snapshot.value ||
    typeof snapshot.value !== "object" ||
    Array.isArray(snapshot.value)
  ) {
    throw new TypeError("Invalid Console preferences");
  }
  const value = snapshot.value as Record<string, unknown>;
  const { mode } = value;
  const position = consolePositions.find(
    (candidate) => candidate === value.position
  );
  if (
    (mode !== "dock" && mode !== "sidebar") ||
    !position ||
    !Array.isArray(value.pinned) ||
    value.pinned.length > 1000
  ) {
    throw new TypeError("Invalid Console preferences");
  }
  const seen = new Set<string>();
  const pinned = value.pinned.map((rawReference: unknown) => {
    if (
      !rawReference ||
      typeof rawReference !== "object" ||
      Array.isArray(rawReference)
    ) {
      throw new TypeError("Invalid Console navigation reference");
    }
    const ref = rawReference as Record<string, unknown>;
    if (
      typeof ref.bindingId !== "string" ||
      !ref.bindingId ||
      ref.bindingId.length > 256 ||
      typeof ref.navigationId !== "string" ||
      !ref.navigationId ||
      ref.navigationId.length > 256
    ) {
      throw new TypeError("Invalid Console navigation reference");
    }
    const reference = {
      bindingId: ref.bindingId,
      navigationId: ref.navigationId,
    };
    const key = consoleReferenceKey(reference);
    if (seen.has(key)) {
      throw new TypeError("Duplicate Console navigation reference");
    }
    seen.add(key);
    return reference;
  });
  return { revision: snapshot.revision, value: { mode, position, pinned } };
}

export function useConsolePreferences(
  store: ConsolePreferenceStore | undefined,
  scopeKey: string,
  defaults: ConsolePreferences
) {
  const [snapshot, setSnapshot] = useState<ConsolePreferenceSnapshot>({
    revision: "",
    value: null,
  });
  const [draft, setDraft] = useState<ConsolePreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!store);
  const [reloadKey, setReloadKey] = useState(0);
  const epoch = useRef<{
    controller: AbortController;
    scopeKey: string;
  } | null>(null);
  const scopedDefaults = useRef({ scopeKey, value: defaults });
  useInsertionEffect(() => {
    if (scopedDefaults.current.scopeKey !== scopeKey) {
      scopedDefaults.current = { scopeKey, value: defaults };
    }
  }, [defaults, scopeKey]);
  useInsertionEffect(
    () => () => {
      epoch.current?.controller.abort();
    },
    [store, scopeKey, reloadKey]
  );
  useEffect(() => {
    const current = { controller: new AbortController(), scopeKey };
    epoch.current = current;
    setDraft(null);
    setError(null);
    // Application defaults seed this scope once; later installs do not edit its pins.
    const initialDefaults = scopedDefaults.current.value;
    setSnapshot({ revision: "", value: initialDefaults });
    setBusy(false);
    setLoaded(!store);
    if (store) {
      void (async () => {
        try {
          const result = projectConsolePreferenceSnapshot(
            await store.read({
              signal: current.controller.signal,
            })
          );
          if (!current.controller.signal.aborted) {
            setSnapshot({
              ...result,
              value: result.value ?? initialDefaults,
            });
            setLoaded(true);
          }
        } catch {
          if (!current.controller.signal.aborted) {
            setError("Preferences could not be loaded. Reload to try again.");
          }
        }
      })();
    }
    return () => {
      current.controller.abort();
    };
  }, [store, scopeKey, reloadKey]);
  // Prevent the old user's preferences appearing during the scope-change render.
  const sameScope = epoch.current?.scopeKey === scopeKey;
  const value = sameScope ? (draft ?? snapshot.value ?? defaults) : defaults;
  const save = async () => {
    const { current } = epoch;
    if (
      !store ||
      !current ||
      current.scopeKey !== scopeKey ||
      current.controller.signal.aborted ||
      busy ||
      !loaded
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const projected = projectConsolePreferenceSnapshot({
        revision: snapshot.revision,
        value,
      });
      const result = projectConsolePreferenceSnapshot(
        await store.save(
          { expectedRevision: snapshot.revision, value: projected.value! },
          { signal: current.controller.signal }
        )
      );
      if (result.value === null) {
        throw new Error("A preference save must preserve explicit values");
      }
      if (!current.controller.signal.aborted) {
        setSnapshot(result);
        setDraft((latest) => (latest === value ? null : latest));
      }
    } catch {
      if (!current.controller.signal.aborted) {
        // A conflict never replaces the user's unsaved order with the server order.
        setError(
          "Preferences were not saved. Your changes are retained. Reload to use the stored version."
        );
      }
    } finally {
      if (!current.controller.signal.aborted) {
        setBusy(false);
      }
    }
  };
  return {
    value,
    error: sameScope ? error : null,
    busy: sameScope && busy,
    loaded: sameScope && loaded,
    change: setDraft,
    save,
    reload: () => setReloadKey((key) => key + 1),
    reset: () => setDraft(defaults),
  };
}
