import { useCallback } from "react";

import { useConsoleLocale, type ConsoleLocale } from "./console-locale";
import { chineseMessages } from "./locales/zh-cn";

type MessageValues = Readonly<Record<string, string | number>>;

export function translateConsoleMessage(
  locale: ConsoleLocale,
  message: string,
  values?: MessageValues
): string {
  const template =
    locale === "zh-CN" ? (chineseMessages[message] ?? message) : message;
  return template.replaceAll(/\{(\w+)\}/gu, (placeholder, key: string) =>
    values && Object.hasOwn(values, key) ? String(values[key]) : placeholder
  );
}

export function useConsoleTranslation() {
  const { locale } = useConsoleLocale();
  return useCallback(
    (message: string, values?: MessageValues) =>
      translateConsoleMessage(locale, message, values),
    [locale]
  );
}
