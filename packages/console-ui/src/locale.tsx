import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";

export type ConsoleLocale = "en" | "zh-CN";
export type ConsoleLanguagePreference = ConsoleLocale | "system";

export interface ConsoleLocaleContextValue {
  locale: ConsoleLocale;
  preference: ConsoleLanguagePreference;
  setPreference: (preference: ConsoleLanguagePreference) => void;
}

const ConsoleLocaleContext = createContext<ConsoleLocaleContextValue>({
  locale: "en",
  preference: "system",
  setPreference: () => null,
});

export const ConsoleLocaleProvider = ({
  children,
  value,
}: PropsWithChildren<{ value: ConsoleLocaleContextValue }>) => (
  <ConsoleLocaleContext.Provider value={value}>
    {children}
  </ConsoleLocaleContext.Provider>
);

export const useConsoleLocale = () => useContext(ConsoleLocaleContext);
