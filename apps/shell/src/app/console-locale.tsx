import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type PropsWithChildren,
} from "react";

import { usePersistedLayout } from "../hooks/use-persisted-layout";

export type ConsoleLocale = "en" | "zh-CN";
export type ConsoleLanguagePreference = ConsoleLocale | "system";

type ConsoleLocaleContextValue = {
  locale: ConsoleLocale;
  preference: ConsoleLanguagePreference;
  setPreference: (value: ConsoleLanguagePreference) => void;
};

const ConsoleLocaleContext = createContext<ConsoleLocaleContextValue>({
  locale: "en",
  preference: "en",
  setPreference: () => undefined,
});

export function HostConsoleLocaleProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] =
    usePersistedLayout<ConsoleLanguagePreference>(
      "lenso-console:language-preference",
      "en"
    );
  const locale = resolveLocale(preference);
  const value = useMemo(
    () => ({ locale, preference, setPreference }),
    [locale, preference, setPreference]
  );

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.languagePreference = preference;
  }, [locale, preference]);

  return (
    <ConsoleLocaleContext.Provider value={value}>
      {children}
    </ConsoleLocaleContext.Provider>
  );
}

export function useConsoleLocale() {
  return useContext(ConsoleLocaleContext);
}

function resolveLocale(preference: ConsoleLanguagePreference): ConsoleLocale {
  if (preference !== "system") {
    return preference;
  }
  return typeof navigator !== "undefined" && navigator.language.startsWith("zh")
    ? "zh-CN"
    : "en";
}
