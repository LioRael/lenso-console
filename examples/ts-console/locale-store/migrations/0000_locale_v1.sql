CREATE TABLE IF NOT EXISTS console_locale_schema (version INTEGER PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS console_locale_default (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh-CN'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS console_locale_preferences (
  realm TEXT NOT NULL, subject TEXT NOT NULL,
  preference TEXT NOT NULL CHECK (preference IN ('global', 'en', 'zh-CN')),
  PRIMARY KEY (realm, subject)
);
--> statement-breakpoint
INSERT OR IGNORE INTO console_locale_schema (version) VALUES (1);
