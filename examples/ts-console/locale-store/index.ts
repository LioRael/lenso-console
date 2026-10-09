import { Database } from "bun:sqlite";

import type { ConsoleIdentity, ConsoleLocaleStore } from "@lenso/console";
import { bindConfig, definePluginConfig } from "@lenso/core";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { z } from "zod";

import { localRealm } from "../local-auth";
import { assertLocaleSchema, assertMigrationHistory } from "./migrations";
import { localeDefault, localePreferences } from "./schema";

export { migrateLocalLocaleStore } from "./migrations";

const localeStoreConfiguration = definePluginConfig({
  schema: z.strictObject({ databasePath: z.string().min(1) }),
  fields: [{ path: ["databasePath"], sensitive: true }],
});

function key(identity: ConsoleIdentity) {
  if (identity.actor.realmId !== localRealm || identity.actor.kind !== "user") {
    throw new Error("Local locale store requires a local user");
  }
  return { realm: identity.actor.realmId, subject: identity.actor.subjectId };
}

export function createLocalLocaleStore(databasePath: string) {
  return bindConfig(
    localeStoreConfiguration,
    { databasePath },
    {
      id: "local-locale-store",
      setup(context, config): ConsoleLocaleStore {
        const client = new Database(config.databasePath, {
          create: false,
          strict: true,
        });
        context.onCleanup(() => client.close());
        assertLocaleSchema(client);
        assertMigrationHistory(client);
        client.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000");
        const db = drizzle(client);
        return {
          async readDefault(signal) {
            signal.throwIfAborted();
            return (
              db
                .select()
                .from(localeDefault)
                .where(eq(localeDefault.singleton, 1))
                .get()?.locale ?? null
            );
          },
          async readPreference(identity, signal) {
            signal.throwIfAborted();
            const { realm, subject } = key(identity);
            return (
              db
                .select()
                .from(localePreferences)
                .where(
                  and(
                    eq(localePreferences.realm, realm),
                    eq(localePreferences.subject, subject)
                  )
                )
                .get()?.preference ?? "global"
            );
          },
          async writePreference(identity, preference, signal) {
            signal.throwIfAborted();
            db.insert(localePreferences)
              .values({ ...key(identity), preference })
              .onConflictDoUpdate({
                target: [localePreferences.realm, localePreferences.subject],
                set: { preference },
              })
              .run();
          },
          async writeDefault(identity, locale, signal) {
            signal.throwIfAborted();
            key(identity);
            if (locale === null) {
              db.delete(localeDefault)
                .where(eq(localeDefault.singleton, 1))
                .run();
              return;
            }
            db.insert(localeDefault)
              .values({ singleton: 1, locale })
              .onConflictDoUpdate({
                target: localeDefault.singleton,
                set: { locale },
              })
              .run();
          },
        };
      },
    }
  );
}
