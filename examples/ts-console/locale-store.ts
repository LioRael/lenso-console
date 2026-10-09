import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { ConsoleIdentity, ConsoleLocaleStore } from "@lenso/console";
import { bindConfig, definePluginConfig } from "@lenso/core";
import { z } from "zod";

import { localRealm } from "./local-auth";

const localeStoreConfiguration = definePluginConfig({
  schema: z.strictObject({ databasePath: z.string().min(1) }),
  fields: [{ path: ["databasePath"], sensitive: true }],
});

function key(identity: ConsoleIdentity) {
  if (identity.actor.realmId !== localRealm || identity.actor.kind !== "user") {
    throw new Error("Local locale store requires a local user");
  }
  return [identity.actor.realmId, identity.actor.subjectId] as const;
}

export function createLocalLocaleStore(databasePath: string) {
  return bindConfig(
    localeStoreConfiguration,
    { databasePath },
    {
      id: "local-locale-store",
      async setup(context, config): Promise<ConsoleLocaleStore> {
        const filename = config.databasePath;
        await mkdir(path.dirname(filename), { recursive: true });
        const db = new Database(filename, { create: true, strict: true });
        context.onCleanup(() => db.close());
        db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000");
        db.transaction(() => {
          db.exec(
            "CREATE TABLE IF NOT EXISTS console_locale_schema (version INTEGER PRIMARY KEY)"
          );
          const versions = db
            .query<{ version: number }, []>(
              "SELECT version FROM console_locale_schema"
            )
            .all();
          if (versions.some(({ version }) => version !== 1)) {
            throw new Error("Unsupported local Console locale schema");
          }
          db.exec(`
          CREATE TABLE IF NOT EXISTS console_locale_default (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            locale TEXT NOT NULL CHECK (locale IN ('en', 'zh-CN'))
          );
          CREATE TABLE IF NOT EXISTS console_locale_preferences (
            realm TEXT NOT NULL, subject TEXT NOT NULL,
            preference TEXT NOT NULL CHECK (preference IN ('global', 'en', 'zh-CN')),
            PRIMARY KEY (realm, subject)
          );
          INSERT OR IGNORE INTO console_locale_schema (version) VALUES (1);
        `);
        })();
        return {
          async readDefault(signal) {
            signal.throwIfAborted();
            const row = db
              .query<{ locale: "en" | "zh-CN" }, []>(
                "SELECT locale FROM console_locale_default WHERE singleton = 1"
              )
              .get();
            return row?.locale ?? null;
          },
          async readPreference(identity, signal) {
            signal.throwIfAborted();
            const row = db
              .query<
                { preference: "global" | "en" | "zh-CN" },
                [string, string]
              >(
                "SELECT preference FROM console_locale_preferences WHERE realm = ? AND subject = ?"
              )
              .get(...key(identity));
            return row?.preference ?? "global";
          },
          async writePreference(identity, preference, signal) {
            signal.throwIfAborted();
            db.query(`INSERT INTO console_locale_preferences (realm, subject, preference) VALUES (?, ?, ?)
            ON CONFLICT (realm, subject) DO UPDATE SET preference = excluded.preference`).run(
              ...key(identity),
              preference
            );
          },
          async writeDefault(identity, locale, signal) {
            signal.throwIfAborted();
            key(identity);
            if (locale === null) {
              db.query(
                "DELETE FROM console_locale_default WHERE singleton = 1"
              ).run();
              return;
            }
            db.query(`INSERT INTO console_locale_default (singleton, locale) VALUES (1, ?)
            ON CONFLICT (singleton) DO UPDATE SET locale = excluded.locale`).run(
              locale
            );
          },
        };
      },
    }
  );
}
