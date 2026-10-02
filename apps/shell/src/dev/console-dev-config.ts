export type ConsoleDevMode = "production" | "mock" | "host";

export type ConsoleDevConfig = {
  diagnosticsUrl: string | null;
  enabled: boolean;
  mode: ConsoleDevMode;
  targetLabel: string | null;
};

export type ConsoleDevEnv = Partial<
  Record<
    | "VITE_CONSOLE_DEV_DIAGNOSTICS_URL"
    | "VITE_CONSOLE_DEV_MODE"
    | "VITE_CONSOLE_DEV_TARGET_LABEL",
    string | undefined
  >
>;

export function consoleDevConfigFromEnv(env: ConsoleDevEnv): ConsoleDevConfig {
  const mode = consoleDevMode(env.VITE_CONSOLE_DEV_MODE);
  return {
    diagnosticsUrl: cleanString(env.VITE_CONSOLE_DEV_DIAGNOSTICS_URL) ?? null,
    enabled: mode !== "production",
    mode,
    targetLabel: cleanString(env.VITE_CONSOLE_DEV_TARGET_LABEL) ?? null,
  };
}

export const consoleDevConfig = consoleDevConfigFromEnv({
  VITE_CONSOLE_DEV_DIAGNOSTICS_URL: import.meta.env
    .VITE_CONSOLE_DEV_DIAGNOSTICS_URL as string | undefined,
  VITE_CONSOLE_DEV_MODE: import.meta.env.VITE_CONSOLE_DEV_MODE as
    | string
    | undefined,
  VITE_CONSOLE_DEV_TARGET_LABEL: import.meta.env
    .VITE_CONSOLE_DEV_TARGET_LABEL as string | undefined,
});

function consoleDevMode(value: string | undefined): ConsoleDevMode {
  if (value === "mock" || value === "host") {
    return value;
  }
  return "production";
}

function cleanString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
