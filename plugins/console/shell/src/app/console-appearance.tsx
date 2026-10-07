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

type ConsoleAppearance = {
  preference: ConsoleThemePreference;
  setPreference: (value: ConsoleThemePreference) => void;
  theme: ConsoleTheme;
};

const AppearanceContext = createContext<ConsoleAppearance>({
  preference: "system",
  setPreference: () => undefined,
  theme: "light",
});

export function ConsoleAppearanceProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] =
    usePersistedLayout<ConsoleThemePreference>(
      "lenso-console:theme-preference",
      "system"
    );
  const [systemTheme, setSystemTheme] = useState<ConsoleTheme>("light");

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(query.matches ? "dark" : "light");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const theme = preference === "system" ? systemTheme : preference;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme;
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
