import { useCallback } from "react";

import {
  createTranslations,
  type MessageValues,
} from "../../../../../packages/console-authoring/src/i18n";
import { useConsoleLocale, type ConsoleLocale } from "./console-locale";

const messages = createTranslations(
  "console",
  {},
  {
    "zh-CN": async () => {
      const { chineseMessages } = await import("./locales/zh-cn");
      return chineseMessages;
    },
  }
);
export function loadConsoleMessages(locale: ConsoleLocale): Promise<void> {
  return messages.load(locale);
}
export function translateConsoleMessage(
  locale: ConsoleLocale,
  message: string,
  values?: MessageValues
): string {
  return messages.translate(locale, message, values);
}
export function useConsoleTranslation() {
  const { locale } = useConsoleLocale();
  return useCallback(
    (message: string, values?: MessageValues) =>
      translateConsoleMessage(locale, message, values),
    [locale]
  );
}
