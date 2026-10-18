/** Structural view of the unreleased Core initialization DTO, with no server import. */
export interface ConsoleInitializationStatus {
  schemaVersion: 1;
  state: "uninitialized" | "blocked" | "awaiting_activation" | "ready";
  revision: string | null;
  blockers: readonly {
    code:
      | "database-unavailable"
      | "external-configuration-required"
      | "activation-failed"
      | "configuration-invalid";
  }[];
  nextAction: "apply" | "external_configuration" | "activate" | "none";
}

/** A host-owned transport. The browser never supplies Core's trusted evidence. */
export interface ConsoleInitializationClient<Input> {
  status(options: { signal: AbortSignal }): Promise<unknown>;
  apply(
    request: { requestId: string; input: Input },
    options: { signal: AbortSignal }
  ): Promise<unknown>;
  activate(options: { signal: AbortSignal }): Promise<unknown>;
}

/** Never retain callback extras, diagnostic values, or arbitrary error messages. */
export function parseConsoleInitializationStatus(
  value: unknown
): ConsoleInitializationStatus {
  if (!value || typeof value !== "object") {
    throw new TypeError("Invalid setup status");
  }
  const data = value as Record<string, unknown>;
  const states = new Set([
    "uninitialized",
    "blocked",
    "awaiting_activation",
    "ready",
  ]);
  const actions = new Set([
    "apply",
    "external_configuration",
    "activate",
    "none",
  ]);
  const codes = new Set([
    "database-unavailable",
    "external-configuration-required",
    "activation-failed",
    "configuration-invalid",
  ]);
  if (
    data.schemaVersion !== 1 ||
    typeof data.state !== "string" ||
    !states.has(data.state) ||
    typeof data.nextAction !== "string" ||
    !actions.has(data.nextAction) ||
    (data.revision !== null &&
      (typeof data.revision !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/u.test(data.revision))) ||
    !Array.isArray(data.blockers) ||
    data.blockers.length > 32
  ) {
    throw new TypeError("Invalid setup status");
  }
  const blockers = data.blockers.map((blocker: unknown) => {
    if (
      !blocker ||
      typeof blocker !== "object" ||
      !("code" in blocker) ||
      typeof blocker.code !== "string" ||
      !codes.has(blocker.code)
    ) {
      throw new TypeError("Invalid setup blocker");
    }
    return {
      code: blocker.code as ConsoleInitializationStatus["blockers"][number]["code"],
    };
  });
  if (
    (data.state === "ready" &&
      (data.revision === null ||
        blockers.length ||
        data.nextAction !== "none")) ||
    (data.state === "uninitialized" &&
      (data.revision !== null ||
        blockers.length ||
        data.nextAction !== "apply")) ||
    (data.state === "awaiting_activation" &&
      (data.revision === null || data.nextAction !== "activate")) ||
    (data.state === "blocked" &&
      (!blockers.length || data.nextAction === "none"))
  ) {
    throw new TypeError("Inconsistent setup status");
  }
  return {
    schemaVersion: 1,
    state: data.state as ConsoleInitializationStatus["state"],
    revision: data.revision as string | null,
    blockers,
    nextAction: data.nextAction as ConsoleInitializationStatus["nextAction"],
  };
}
