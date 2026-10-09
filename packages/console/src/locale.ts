import { z } from "zod";

import { ConsoleRequestError } from "./auth";
import { readRequestBytes } from "./request-body";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleLocaleStore,
  ConsoleOptions,
} from "./types";

const language = z.enum(["en", "zh-CN"]);
const preferenceInput = z.strictObject({
  preference: z.union([language, z.literal("global")]),
});
const defaultInput = z.strictObject({ locale: language.nullable() });

export function createLocaleRoutes(
  store: ConsoleLocaleStore | undefined,
  auth: ConsoleAuthentication,
  resource: ConsoleOptions["localeResource"]
) {
  if (
    resource &&
    (resource.action !== "configure" ||
      resource.operation !== "console.locale.default.manage")
  ) {
    throw new Error(
      "Locale default requires its independently bound management permission."
    );
  }
  async function snapshot(
    identity: ConsoleIdentity | undefined,
    signal: AbortSignal
  ) {
    signal.throwIfAborted();
    const globalDefault = store
      ? language.nullable().parse(await store.readDefault(signal))
      : null;
    const preference =
      store && identity
        ? preferenceInput.shape.preference.parse(
            await store.readPreference(identity, signal)
          )
        : "global";
    const canManageDefault = !!(
      store &&
      identity &&
      resource &&
      (await auth.can(identity, resource))
    );
    signal.throwIfAborted();
    return Response.json(
      {
        global_default: globalDefault,
        preference,
        locale: preference === "global" ? globalDefault : preference,
        can_manage_default: canManageDefault,
        available: !!store,
        ...(store
          ? {}
          : {
              unavailableReason:
                "The application has not installed a durable locale provider.",
            }),
      },
      { headers: { "cache-control": "no-store" } }
    );
  }
  return {
    snapshot,
    async fetch(request: Request, suffix: string, identity: ConsoleIdentity) {
      if (identity.actor.kind !== "user") {
        throw new ConsoleRequestError("forbidden");
      }
      if (suffix === "" && request.method === "GET") {
        return snapshot(identity, request.signal);
      }
      if (
        request.method !== "PUT" ||
        !["/preference", "/default"].includes(suffix)
      ) {
        return undefined;
      }
      if (!store) {
        throw new ConsoleRequestError("service_unavailable");
      }
      const bytes = await readRequestBytes(
        request,
        4096,
        () => new ConsoleRequestError("bad_request")
      );
      let input: unknown;
      try {
        input = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new ConsoleRequestError("bad_request");
      }
      const current = await auth.authenticate(request);
      if (
        current.actor.kind !== "user" ||
        current.actor.realmId !== identity.actor.realmId ||
        current.actor.subjectId !== identity.actor.subjectId
      ) {
        throw new ConsoleRequestError("session_changed");
      }
      request.signal.throwIfAborted();
      if (suffix === "/preference") {
        const parsed = preferenceInput.safeParse(input);
        if (!parsed.success) {
          throw new ConsoleRequestError("bad_request");
        }
        await store.writePreference(
          current,
          parsed.data.preference,
          request.signal
        );
      } else {
        const parsed = defaultInput.safeParse(input);
        if (!parsed.success) {
          throw new ConsoleRequestError("bad_request");
        }
        if (!resource) {
          throw new ConsoleRequestError("forbidden");
        }
        await auth.enforce(current, resource);
        request.signal.throwIfAborted();
        await store.writeDefault(current, parsed.data.locale, request.signal);
      }
      request.signal.throwIfAborted();
      return snapshot(current, request.signal);
    },
  };
}
