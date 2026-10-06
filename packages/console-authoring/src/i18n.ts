/** Console and Plugin locale vocabulary. The English catalog is the fallback. */
export type ConsoleLocale = "en" | "zh-CN";
export type ConsoleLanguagePreference = ConsoleLocale | "global";
export type MessageValues = Readonly<Record<string, string | number>>;
export type MessageCatalog = Readonly<Record<string, string>>;
export type LocaleSnapshot = {
  global_default: ConsoleLocale | null;
  preference: ConsoleLanguagePreference;
  can_manage_default: boolean;
  available: boolean;
};

export function supportedLocale(value: unknown): ConsoleLocale | undefined {
  return value === "en" || value === "zh-CN" ? value : undefined;
}

export function resolveConsoleLocale(
  preference: ConsoleLanguagePreference,
  globalDefault: ConsoleLocale | null,
  languages: readonly string[] = []
): ConsoleLocale {
  if (preference !== "global") {
    return preference;
  }
  if (globalDefault) {
    return globalDefault;
  }
  for (const language of languages) {
    if (/^zh(?:-|$)/iu.test(language)) {
      return "zh-CN";
    }
    if (/^en(?:-|$)/iu.test(language)) {
      return "en";
    }
  }
  return "en";
}

export function interpolateMessage(
  template: string,
  values?: MessageValues
): string {
  return template.replaceAll(/\{(\w+)\}/gu, (placeholder, key: string) =>
    values && Object.hasOwn(values, key) ? String(values[key]) : placeholder
  );
}

/** A Plugin owns one stable namespace and its catalogs. No server source is loaded. */
export function createTranslations(
  namespace: string,
  english: MessageCatalog,
  loaders: Partial<Record<ConsoleLocale, () => Promise<MessageCatalog>>>,
  initialCatalogs: Partial<Record<ConsoleLocale, MessageCatalog>> = {}
) {
  if (!/^[a-z][a-z0-9._-]{0,127}$/u.test(namespace)) {
    throw new Error("Invalid translation namespace");
  }
  const catalogs = new Map<ConsoleLocale, MessageCatalog>([["en", english]]);
  for (const locale of ["en", "zh-CN"] as const) {
    const catalog = initialCatalogs[locale];
    if (catalog) {
      catalogs.set(locale, catalog);
    }
  }
  const pending = new Map<ConsoleLocale, Promise<void>>();
  return {
    namespace,
    load(locale: ConsoleLocale): Promise<void> {
      if (catalogs.has(locale)) {
        return Promise.resolve();
      }
      const existing = pending.get(locale);
      if (existing) {
        return existing;
      }
      const loader = loaders[locale];
      if (!loader) {
        return Promise.resolve();
      }
      const promise = (async () => {
        // Register this promise before calling a loader that might throw synchronously.
        await Promise.resolve();
        try {
          const catalog = await loader();
          catalogs.set(locale, catalog);
        } finally {
          pending.delete(locale);
        }
      })();
      pending.set(locale, promise);
      return promise;
    },
    translate(
      locale: ConsoleLocale,
      key: string,
      values?: MessageValues
    ): string {
      const catalog = catalogs.get(locale);
      const message =
        catalog && Object.hasOwn(catalog, key)
          ? catalog[key]
          : Object.hasOwn(english, key)
            ? english[key]
            : key;
      return interpolateMessage(message ?? key, values);
    },
  };
}

export const formatConsoleDate = (
  locale: ConsoleLocale,
  date: Date | number,
  options?: Intl.DateTimeFormatOptions
) => new Intl.DateTimeFormat(locale, options).format(date);
export const formatConsoleNumber = (
  locale: ConsoleLocale,
  number: number | bigint,
  options?: Intl.NumberFormatOptions
) => new Intl.NumberFormat(locale, options).format(number);
