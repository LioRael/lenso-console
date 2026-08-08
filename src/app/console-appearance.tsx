import type {
  ConsoleThemeBundleReceipt,
  ConsoleUiComposition,
} from "@lenso/console-composition-api";
import {
  darkTheme,
  legacyTokenCssVariables,
  lightTheme,
  tokenCssVariables,
} from "@lenso/console-tokens/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
} from "react";

import { usePersistedLayout } from "../hooks/use-persisted-layout";
import { useConsoleThemeBundles } from "./console-artifact-query";
import {
  createConsoleThemeBundleActivation,
  embeddedOfficialDefaultThemeBundle,
  prepareConsoleThemeBundleActivation,
  type ConsoleThemeBundleActivation,
  type ConsoleThemeBundleActivationTransaction,
} from "./console-theme-bundle";

const styles = stylex.create({
  themeRoot: {
    display: "contents",
  },
});

export type ConsoleTheme = "dark" | "light";
export type ConsoleThemePreference = ConsoleTheme | "system";

export const consoleThemeBundleStorageKey = "lenso-console:theme-bundle";
export const consoleThemeVariantStorageKey = "lenso-console:theme-variant";

const AppearanceContext = createContext<{
  preference: ConsoleThemePreference;
  setPreference: (value: ConsoleThemePreference) => void;
  theme: ConsoleTheme;
  bundleId: string | null;
  setBundleId: (value: string | null) => void;
  variantId: string | null;
  setVariantId: (value: string | null) => void;
  bundleLoading: boolean;
  bundleError: string | null;
  composition: ConsoleUiComposition | undefined;
  recoverToOfficialDefault: (error?: unknown) => void;
  themeBundles: readonly ConsoleThemeBundleReceipt[];
}>({
  preference: "dark",
  setPreference: () => undefined,
  theme: "dark",
  bundleId: null,
  setBundleId: () => undefined,
  variantId: null,
  setVariantId: () => undefined,
  bundleLoading: false,
  bundleError: null,
  composition: undefined,
  recoverToOfficialDefault: () => undefined,
  themeBundles: [],
});

export function ConsoleAppearanceProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] =
    usePersistedLayout<ConsoleThemePreference>(
      "lenso-console:theme-preference",
      "dark"
    );
  const [systemTheme, setSystemTheme] =
    useState<ConsoleTheme>(systemThemeValue);
  const preferredTheme = preference === "system" ? systemTheme : preference;
  const [bundleId, setBundleId] = usePersistedLayout<string | null>(
    consoleThemeBundleStorageKey,
    null
  );
  const [variantId, setVariantId] = usePersistedLayout<string | null>(
    consoleThemeVariantStorageKey,
    null
  );
  const bundlesQuery = useConsoleThemeBundles();
  const selectedBundle = bundlesQuery.data?.find(
    (bundle) => bundle.bundleId === bundleId
  );
  const selectedVariant = selectedBundle?.manifest.variants.find(
    (variant) => variant.id === variantId
  );
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [activeBundle, setActiveBundle] =
    useState<ConsoleThemeBundleActivation | null>(null);
  const committedBundleTransaction =
    useRef<ConsoleThemeBundleActivationTransaction | null>(null);
  const embeddedDefault = useMemo(
    () =>
      createConsoleThemeBundleActivation(
        embeddedOfficialDefaultThemeBundle,
        preferredTheme
      ),
    [preferredTheme]
  );
  const presentation = activeBundle ?? embeddedDefault;
  const theme =
    presentation.mode === "custom" ? preferredTheme : presentation.mode;

  const recoverToOfficialDefault = useCallback(
    (error?: unknown) => {
      committedBundleTransaction.current?.rollback();
      committedBundleTransaction.current = null;
      setActiveBundle(null);
      setBundleLoading(false);
      if (error === undefined) {
        setBundleError(null);
      } else {
        setBundleError(consoleThemeBundleErrorMessage(error));
      }
      setBundleId(null);
      setVariantId(null);
    },
    [setBundleId, setVariantId]
  );

  useEffect(() => {
    if (bundlesQuery.data === undefined) {
      return;
    }
    if (bundleId && !selectedBundle) {
      recoverToOfficialDefault(
        new Error(`Console Theme Bundle is unavailable: ${bundleId}`)
      );
      return;
    }
    if (selectedBundle && !selectedVariant) {
      setVariantId(selectedBundle.manifest.defaultVariant);
    }
  }, [
    bundleId,
    bundlesQuery.data,
    recoverToOfficialDefault,
    selectedBundle,
    selectedVariant,
    setVariantId,
  ]);

  useEffect(() => {
    if (!selectedBundle || !selectedVariant) {
      return;
    }
    const bundle = selectedBundle;
    const variant = selectedVariant;
    let active = true;
    let committed = false;
    let transaction: ConsoleThemeBundleActivationTransaction | null = null;
    async function loadBundle() {
      setBundleLoading(true);
      setBundleError(null);
      try {
        transaction = await prepareConsoleThemeBundleActivation(bundle, {
          variantId: variant.id,
        });
        if (!active) {
          transaction.rollback();
          return;
        }
        transaction.commit();
        committed = true;
        committedBundleTransaction.current = transaction;
        setActiveBundle(transaction.activation);
      } catch (error: unknown) {
        if (active) {
          recoverToOfficialDefault(error);
        }
      } finally {
        if (active) {
          setBundleLoading(false);
        }
      }
    }
    void loadBundle();
    return () => {
      active = false;
      if (!committed) {
        transaction?.rollback();
      }
    };
  }, [recoverToOfficialDefault, selectedBundle, selectedVariant]);

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
    () => ({
      preference,
      setPreference,
      theme,
      bundleId: presentation.bundleId,
      setBundleId,
      variantId: presentation.variantId,
      setVariantId,
      bundleLoading,
      bundleError,
      composition: presentation.composition,
      recoverToOfficialDefault,
      themeBundles: bundlesQuery.data ?? [],
    }),
    [
      bundleError,
      bundleLoading,
      preference,
      setBundleId,
      setPreference,
      setVariantId,
      theme,
      bundlesQuery.data,
      presentation.bundleId,
      presentation.composition,
      presentation.variantId,
      recoverToOfficialDefault,
    ]
  );
  const themeOverrides = useMemo(() => {
    const overrides = presentation.tokenOverrides;
    const style: Record<string, string | number> = {};
    for (const [name, overrideValue] of Object.entries(overrides)) {
      const key = name.includes(".") ? name.split(".").at(-1) : name;
      if (key && key in tokenCssVariables) {
        style[tokenCssVariables[key as keyof typeof tokenCssVariables]] =
          overrideValue;
        style[
          legacyTokenCssVariables[key as keyof typeof legacyTokenCssVariables]
        ] = overrideValue;
      }
    }
    return style as CSSProperties;
  }, [presentation]);
  const previousThemeOverrideKeys = useRef<string[]>([]);
  const themeClassName = stylex.props(
    theme === "light" ? lightTheme : darkTheme
  ).className;

  useLayoutEffect(() => {
    // Keep the document contract used by the host parity layer in sync with
    // the StyleX theme classes. This also preserves the original light-theme
    // token cascade for legacy page selectors.
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    const roots = [document.documentElement, document.body].filter(
      (root): root is HTMLElement => root !== null
    );
    const allThemeClasses = [lightTheme, darkTheme]
      .map((themeStyle) => stylex.props(themeStyle).className ?? "")
      .flatMap((className) => className.split(/\s+/u).filter(Boolean));
    const selectedThemeClasses = (themeClassName ?? "")
      .split(/\s+/u)
      .filter(Boolean);
    for (const root of roots) {
      root.classList.remove(...allThemeClasses);
      root.classList.add(...selectedThemeClasses);
    }

    const nextOverrides = Object.entries(themeOverrides);
    for (const root of roots) {
      for (const key of previousThemeOverrideKeys.current) {
        if (!Object.hasOwn(themeOverrides, key)) {
          root.style.removeProperty(key);
        }
      }
      for (const [key, overrideValue] of nextOverrides) {
        root.style.setProperty(key, String(overrideValue));
      }
    }
    previousThemeOverrideKeys.current = nextOverrides.map(([key]) => key);
  }, [preference, theme, themeClassName, themeOverrides]);

  return (
    <AppearanceContext.Provider value={value}>
      <div
        {...stylex.props(
          styles.themeRoot,
          theme === "light" ? lightTheme : darkTheme
        )}
        data-stylex-theme={theme}
        data-theme-bundle={presentation.bundleId}
        data-theme-variant={presentation.variantId}
        style={themeOverrides}
      >
        {children}
      </div>
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

function consoleThemeBundleErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Console Theme Bundle could not be activated";
}
