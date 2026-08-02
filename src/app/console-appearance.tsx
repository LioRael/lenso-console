import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { usePersistedLayout } from "../hooks/use-persisted-layout";

export type ConsoleTheme = "dark" | "light";
export type ConsoleThemePreference = ConsoleTheme | "system";

const AppearanceContext = createContext<{
  preference: ConsoleThemePreference;
  setPreference: (value: ConsoleThemePreference) => void;
  theme: ConsoleTheme;
}>({ preference: "system", setPreference: () => undefined, theme: "dark" });

export function ConsoleAppearanceProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] =
    usePersistedLayout<ConsoleThemePreference>(
      "lenso-console:theme-preference",
      "system"
    );
  const [systemTheme, setSystemTheme] =
    useState<ConsoleTheme>(systemThemeValue);
  const theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(query.matches ? "dark" : "light");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
  }, [preference, theme]);

  const value = useMemo(
    () => ({ preference, setPreference, theme }),
    [preference, setPreference, theme]
  );
  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useConsoleAppearance() {
  return useContext(AppearanceContext);
}

function systemThemeValue(): ConsoleTheme {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}
