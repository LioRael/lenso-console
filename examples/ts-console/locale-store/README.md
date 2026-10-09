# Local Console locale storage

`schema.ts` defines the current Drizzle tables; `index.ts` owns the connection
and locale repository. Startup opens an existing database and validates it. It
does not create tables, adopt migration records, or apply migrations.

Explicitly initialize or adopt an authorized local/test database:

```sh
bun examples/ts-console/locale-store/migrate.ts .artifacts/ts-console/locale.sqlite
```

The argument is resolved from the command's working directory. For a custom
`LENSO_TS_DATABASE` or `local.json` setting, pass the same resolved database path
used by the host. This command does not authorize production migration.

## Historical migration contract

- `migrations/0000_locale_v1.sql` is the immutable version-1 baseline from the
  handwritten store. Its three table definitions, constraints, realm/subject
  primary key and version marker are retained.
- `migrations/meta/_journal.json` fixes migration order and timestamp. Never
  edit or renumber an applied entry or its SQL; future changes need new entries.
- Drizzle records the SQL SHA-256 hash and timestamp in `__drizzle_migrations`.
  The repository checks recorded entries against the ordered checked-in history,
  rejecting unknown, reordered or changed entries.
- A populated legacy version-1 database remains usable without a journal.
  Explicit adoption validates the historical definitions, preserves its rows,
  and records the baseline once. Repeating the command is idempotent.
- Unknown versions or mismatched legacy definitions are refused before migration
  writes. There is no reset, wipe, or automatic upgrade path.
