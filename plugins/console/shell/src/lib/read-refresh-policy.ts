import {
  type ReadRefreshPolicy,
  resolveReadRefreshPolicy,
} from "@lenso/console-sdk";

export interface ConsoleReadRefreshConfiguration {
  defaults?: ReadRefreshPolicy;
  mounts?: Readonly<Record<string, ReadRefreshPolicy>>;
}

const inheritedDefaults = {
  focus: "never",
  staleTimeMs: 10_000,
} satisfies ReadRefreshPolicy;

function policy(value: unknown): ReadRefreshPolicy {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["focus", "staleTimeMs", "gcTimeMs", "remount"].includes(key)
    ) ||
    ("focus" in value &&
      value.focus !== "never" &&
      value.focus !== "stale" &&
      value.focus !== "always") ||
    ("staleTimeMs" in value &&
      (typeof value.staleTimeMs !== "number" ||
        !Number.isFinite(value.staleTimeMs))) ||
    ("gcTimeMs" in value &&
      (typeof value.gcTimeMs !== "number" ||
        !Number.isFinite(value.gcTimeMs))) ||
    ("remount" in value &&
      value.remount !== "never" &&
      value.remount !== "stale" &&
      value.remount !== "always")
  ) {
    throw new TypeError("Console read refresh policy is invalid");
  }
  const result = value as ReadRefreshPolicy;
  resolveReadRefreshPolicy(result);
  return result;
}

export function parseConsoleReadRefreshConfiguration(
  value: unknown
): ConsoleReadRefreshConfiguration {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "defaults" && key !== "mounts")
  ) {
    throw new TypeError("Console read refresh configuration is invalid");
  }
  const defaults = "defaults" in value ? policy(value.defaults) : undefined;
  let mounts: Record<string, ReadRefreshPolicy> | undefined;
  if ("mounts" in value) {
    if (
      !value.mounts ||
      typeof value.mounts !== "object" ||
      Array.isArray(value.mounts) ||
      Object.keys(value.mounts).length > 64
    ) {
      throw new TypeError("Console read refresh mount policies are invalid");
    }
    mounts = Object.fromEntries(
      Object.entries(value.mounts).map(([id, declaration]) => {
        if (!/^[a-z][a-z0-9._-]{0,63}$/u.test(id)) {
          throw new TypeError("Console read refresh mount identity is invalid");
        }
        return [id, policy(declaration)];
      })
    );
  }
  return {
    ...(defaults === undefined ? {} : { defaults }),
    ...(mounts === undefined ? {} : { mounts }),
  };
}

const configuration = parseConsoleReadRefreshConfiguration(
  JSON.parse(import.meta.env.VITE_CONSOLE_READ_REFRESH_POLICY || "{}")
);

/** Read settings only. Query keys and authenticated mount lifetimes remain unchanged. */
export function consoleReadRefreshPolicy(
  mountId?: string,
  settings: ConsoleReadRefreshConfiguration = configuration
): ReadRefreshPolicy &
  Required<Pick<ReadRefreshPolicy, "focus" | "staleTimeMs">> {
  const mount =
    mountId && settings.mounts && Object.hasOwn(settings.mounts, mountId)
      ? settings.mounts[mountId]
      : undefined;
  return {
    ...settings.defaults,
    ...mount,
    focus: mount?.focus ?? settings.defaults?.focus ?? inheritedDefaults.focus,
    staleTimeMs:
      mount?.staleTimeMs ??
      settings.defaults?.staleTimeMs ??
      inheritedDefaults.staleTimeMs,
  };
}
