import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  resolveConsoleLocale,
  supportedLocale,
  type ConsoleLanguagePreference,
  type ConsoleLocale,
  type LocaleSnapshot,
} from "../../../../packages/console-authoring/src/i18n";
import {
  ConsoleLocaleProvider,
  useConsoleLocale,
} from "../../../../packages/console-authoring/src/locale";
import {
  subscribeIdentityTransitions,
  withIdentityRead,
} from "../lib/identity-transition";
import { sessionFetch } from "../lib/session-fetch";
import { loadConsoleMessages } from "./console-i18n";
export { useConsoleLocale };
export type { ConsoleLocale, ConsoleLanguagePreference };

const browserLanguages = () =>
  typeof navigator === "undefined" ? [] : navigator.languages;
const initial: LocaleSnapshot = {
  global_default: null,
  preference: "global",
  can_manage_default: false,
  available: false,
};
function initialSnapshot(): LocaleSnapshot {
  if (typeof document === "undefined") return initial;
  try {
    const value: unknown = JSON.parse(
      document.getElementById("lenso-console-locale")?.textContent ?? "null"
    );
    if (value && typeof value === "object" && "global_default" in value)
      return {
        ...initial,
        global_default: supportedLocale(value.global_default) ?? null,
      };
  } catch {
    /* Unavailable bootstrap falls back to the supported browser language. */
  }
  return initial;
}
let adoptSessionLocale:
  | ((subject: string, signal?: AbortSignal) => Promise<void>)
  | undefined;
/** Called by the existing session boundary before admitting content. Never changes session/cache identity. */
export async function prepareSessionLocale(
  subject: string,
  signal?: AbortSignal
) {
  await adoptSessionLocale?.(subject, signal);
}
export function parseLocaleSnapshot(value: unknown): LocaleSnapshot {
  if (!value || typeof value !== "object")
    throw new Error("Invalid locale response");
  const record = value as Record<string, unknown>;
  const preference = record.preference;
  const globalDefault = record.global_default;
  if (
    !(preference === "global" || supportedLocale(preference)) ||
    !(globalDefault === null || supportedLocale(globalDefault)) ||
    typeof record.can_manage_default !== "boolean" ||
    typeof record.available !== "boolean"
  )
    throw new Error("Invalid locale response");
  return {
    preference: preference as ConsoleLanguagePreference,
    global_default: globalDefault as ConsoleLocale | null,
    can_manage_default: record.can_manage_default,
    available: record.available,
  };
}

export function HostConsoleLocaleProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [locale, setLocale] = useState<ConsoleLocale>(() =>
    resolveConsoleLocale(
      "global",
      initialSnapshot().global_default,
      browserLanguages()
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const subject = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const apply = useCallback(async (next: LocaleSnapshot, current: number) => {
    const resolved = resolveConsoleLocale(
      next.preference,
      next.global_default,
      browserLanguages()
    );
    let languageError: string | null = null;
    try {
      await loadConsoleMessages(resolved);
    } catch {
      languageError =
        "Could not load translations. English text is shown until you retry.";
    }
    if (current !== generation.current) return;
    setSnapshot(next);
    setLocale(resolved);
    setError(languageError);
  }, []);
  useLayoutEffect(() => {
    const adopt = async (nextSubject: string, signal?: AbortSignal) => {
      const changed = subject.current !== nextSubject;
      if (!changed && busy.current) return;
      subject.current = nextSubject;
      const current = ++generation.current;
      try {
        const response = await sessionFetch("/api/console/v1/locale", {
          cache: "no-store",
          ...(signal ? { signal } : {}),
        });
        if (response.status === 404) {
          await apply(initial, current);
          return;
        }
        if (!response.ok)
          throw new Error("Language preferences are unavailable");
        await apply(parseLocaleSnapshot(await response.json()), current);
      } catch (failure) {
        if (signal?.aborted || current !== generation.current) return;
        // Retain a same-account refresh. A new account never inherits the former preference.
        if (changed) await apply(initial, current);
        if (current === generation.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Language preferences are unavailable"
          );
      }
    };
    adoptSessionLocale = adopt;
    void adopt("anonymous").finally(() => setReady(true));
    const unsubscribe = subscribeIdentityTransitions((phase) => {
      if (phase !== "begin") return;
      subject.current = undefined;
      const current = ++generation.current;
      setSaving(false);
      void apply(initial, current);
    });
    return () => {
      unsubscribe();
      if (adoptSessionLocale === adopt) adoptSessionLocale = undefined;
      generation.current += 1;
    };
  }, [apply]);
  const write = useCallback(
    async (path: string, body: object) => {
      if (busy.current) return;
      busy.current = true;
      setSaving(true);
      const current = ++generation.current;
      try {
        const controller = new AbortController();
        const response = await withIdentityRead(
          () =>
            sessionFetch(path, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
              signal: controller.signal,
            }),
          controller.signal
        );
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? "You do not have permission to change this language setting"
              : "Could not save language preferences"
          );
        await apply(parseLocaleSnapshot(await response.json()), current);
      } catch (failure) {
        if (current === generation.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not save language preferences"
          );
      } finally {
        busy.current = false;
        if (current === generation.current) setSaving(false);
      }
    },
    [apply]
  );
  const setPreference = useCallback(
    (preference: ConsoleLanguagePreference) =>
      write("/api/console/v1/locale/preference", { preference }),
    [write]
  );
  const setGlobalDefault = useCallback(
    (next: ConsoleLocale | null) =>
      write("/api/console/v1/locale/default", { locale: next }),
    [write]
  );
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.languagePreference = snapshot.preference;
  }, [locale, snapshot.preference]);
  const value = useMemo(
    () => ({
      locale,
      preference: snapshot.preference,
      globalDefault: snapshot.global_default,
      available: snapshot.available,
      canManageDefault: snapshot.can_manage_default,
      saving,
      error,
      setPreference,
      setGlobalDefault,
    }),
    [locale, snapshot, saving, error, setPreference, setGlobalDefault]
  );
  return (
    <ConsoleLocaleProvider value={value}>
      {ready ? children : <output aria-busy="true" />}
    </ConsoleLocaleProvider>
  );
}
