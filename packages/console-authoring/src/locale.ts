import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";

import type { ConsoleLocale, ConsoleLanguagePreference } from "./i18n";

export type { ConsoleLocale, ConsoleLanguagePreference } from "./i18n";

export interface ConsoleLocaleValue {
  locale: ConsoleLocale;
  preference: ConsoleLanguagePreference;
  globalDefault: ConsoleLocale | null;
  available: boolean;
  canManageDefault: boolean;
  saving: boolean;
  error: string | null;
  setPreference(value: ConsoleLanguagePreference): Promise<void>;
  setGlobalDefault(value: ConsoleLocale | null): Promise<void>;
}
const unavailable = async () => {
  throw new Error("Console language preferences are unavailable on this Host");
};
const LocaleContext = createContext<ConsoleLocaleValue>({
  locale: "en",
  preference: "global",
  globalDefault: null,
  available: false,
  canManageDefault: false,
  saving: false,
  error: null,
  setPreference: unavailable,
  setGlobalDefault: unavailable,
});
/** The Shell provides the singleton; plugins consume it without owning session state. */
export function ConsoleLocaleProvider({
  value,
  children,
}: {
  value: ConsoleLocaleValue;
  children: ReactNode;
}) {
  return createElement(LocaleContext.Provider, { value }, children);
}
export function useConsoleLocale(): ConsoleLocaleValue {
  const value = useContext(LocaleContext);
  return value;
}
