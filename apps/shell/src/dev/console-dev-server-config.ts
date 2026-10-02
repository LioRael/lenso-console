export type ConsoleDevServerConfig = {
  allowedHosts: string[];
  host: "0.0.0.0" | "127.0.0.1";
  trustedOrigin: string | undefined;
};

export type ConsoleDevServerEnv = Partial<
  Record<"LENSO_CONSOLE_DEV_REMOTE_ORIGIN", string | undefined>
>;

export function consoleDevServerConfigFromEnv(
  env: ConsoleDevServerEnv
): ConsoleDevServerConfig {
  const configuredOrigin = env.LENSO_CONSOLE_DEV_REMOTE_ORIGIN?.trim();
  if (!configuredOrigin) {
    return {
      allowedHosts: [],
      host: "127.0.0.1",
      trustedOrigin: undefined,
    };
  }

  const trustedOrigin = parseHttpOrigin(configuredOrigin);
  return {
    allowedHosts: [new URL(trustedOrigin).hostname],
    host: "0.0.0.0",
    trustedOrigin,
  };
}

function parseHttpOrigin(value: string) {
  const error =
    "LENSO_CONSOLE_DEV_REMOTE_ORIGIN must be an HTTP(S) Origin without credentials, path, query, or fragment";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(error);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(error);
  }
  return url.origin;
}
