import {
  ConsoleLocaleProvider,
  type ConsoleLanguagePreference,
  type ConsoleLocale,
} from "@lenso/console-ui-internal";
import { useLayoutEffect, useMemo, type PropsWithChildren } from "react";

import { usePersistedLayout } from "../hooks/use-persisted-layout";

export function HostConsoleLocaleProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] =
    usePersistedLayout<ConsoleLanguagePreference>(
      "lenso-console:language-preference",
      "system"
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
    <ConsoleLocaleProvider value={value}>{children}</ConsoleLocaleProvider>
  );
}

function resolveLocale(preference: ConsoleLanguagePreference): ConsoleLocale {
  if (preference !== "system") {
    return preference;
  }
  return typeof navigator !== "undefined" && navigator.language.startsWith("zh")
    ? "zh-CN"
    : "en";
}
