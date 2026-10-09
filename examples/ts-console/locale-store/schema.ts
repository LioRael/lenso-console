import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const localeSchema = sqliteTable("console_locale_schema", {
  version: integer("version").primaryKey(),
});

export const localeDefault = sqliteTable(
  "console_locale_default",
  {
    singleton: integer("singleton").primaryKey(),
    locale: text("locale", { enum: ["en", "zh-CN"] }).notNull(),
  },
  (table) => [
    check("singleton", sql`${table.singleton} = 1`),
    check("locale", sql`${table.locale} IN ('en', 'zh-CN')`),
  ]
);

export const localePreferences = sqliteTable(
  "console_locale_preferences",
  {
    realm: text("realm").notNull(),
    subject: text("subject").notNull(),
    preference: text("preference", {
      enum: ["global", "en", "zh-CN"],
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.realm, table.subject] }),
    check("preference", sql`${table.preference} IN ('global', 'en', 'zh-CN')`),
  ]
);
