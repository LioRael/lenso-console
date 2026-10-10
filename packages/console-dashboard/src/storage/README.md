# Durable Dashboard storage

The SQLite, PostgreSQL and D1 entrypoints expose:

| Entrypoint | Factory | Explicit schema initializer |
| --- | --- | --- |
| `@lenso/console-dashboard/server/sqlite` | `createSqliteDashboardRepository(client, defaults)` | `initializeSqliteDashboardSchema(client)` |
| `@lenso/console-dashboard/server/postgres` | `createPostgresDashboardRepository(client, defaults)` | `initializePostgresDashboardSchema(client)` |
| `@lenso/console-dashboard/server/d1` | `createD1DashboardRepository(binding, defaults)` | `initializeD1DashboardSchema(binding)` |

Factories validate and copy the default document. They do not connect, create
tables, migrate production databases or own client cleanup. A scope with no saved
document reads the supplied defaults at revision `"0"`, without inserting a row.
Use the same defaults across every process serving a dashboard.

SQLite takes the native `Database` from `bun:sqlite`, also accepted by
`@lenso/db/bun-sqlite`. PostgreSQL takes the native `SQL` from `bun`, also accepted
by `@lenso/db/bun-sql`, or a structural `pg` Pool with `connect`, `query` and
`release`. D1 takes a native Workers D1 binding, not a SQLite wrapper. No Drizzle,
`pg` or Workers runtime import is required by these repositories. Applications
using `pg` install and configure it themselves.

## Initialization and operation

Apply the exported `dashboardSqliteSchemaSql`, `dashboardPostgresSchemaSql` or
`dashboardD1SchemaSql` through an approved application migration. The initializer
functions are explicit conveniences for a new database or local tests, not an
automatic production upgrade mechanism. They create fixed document and mutation
tables and the unique `(scope_key, mutation_id)` primary key.

Use the repository through the authorized Dashboard service. `scopeKey` is a
stable, trusted storage key supplied by authorization, never a request-body or
actor-provided key. Durable mutation lookup requires the third transaction
argument `{ mutationId }`. Only that mutation is loaded; attempts to look up or
commit another ID throw. A read needs no mutation hint.

The callback sees synchronous reads and stages at most one immutable commit.
Nothing is persisted until its async projection and authorization work returns
successfully. The repository calls `beforeCommit` and checks `signal` immediately
before durable dispatch. SQLite performs a short native immediate transaction;
PostgreSQL performs a database-locked SQL transaction and invokes `beforeCommit`
immediately before `COMMIT`; D1 performs a native atomic batch, never `BEGIN`.

D1 first conditionally admits the mutation against the current revision, then
updates the document only if the mutation belongs to that unique dispatch token.
Both statements share one batch transaction. A final exact mutation lookup
verifies the outcome: a successful batch alone does not prove CAS succeeded.
SQLite and PostgreSQL also keep the document CAS and mutation record in one
database transaction. These rules work across independent database clients,
without process-local locking.

SQLite rejects an already-active transaction instead of silently creating a
savepoint and acknowledging a write before an application-owned outer commit.
Configure SQLite WAL and an appropriate busy timeout in application setup when
multiple processes share the file. Keep final authorization callbacks bounded;
PostgreSQL holds its scope lock until authorization and commit finish.

## Retries, conflicts and audit

Mutation IDs and fingerprints are scope-bound. The authorized service constructs
the fingerprint from admitted request content. An existing ID with another
fingerprint throws `DashboardMutationCollisionError`; a stale revision throws
`DashboardConflictError`. Repeating an acknowledged mutation returns its saved
snapshot even after later mutations. Concurrent matching IDs can acknowledge only
the exact snapshot already projected by the callback; otherwise retry explicitly
to project the stored winner.

`DashboardCommitOutcomeUnknownError` means dispatch may have committed, but the
driver response or verification was lost. Do not report this as a definite
rollback. Retry the same scope, mutation ID, expected revision and content to
resolve the stored outcome. Aborting after an acknowledged commit does not
retroactively undo the database write.

Document and mutation storage are atomic. Audit receipts are handled separately
by the authorized service's existing strict `@lenso/audit` prepare/complete
workflow; these repositories do not claim an atomic audit outbox. Application
audit policy must represent unknown commit outcomes accurately.

Saved documents, replay documents and defaults all pass the shared Dashboard
validation and byte bounds. Mutation records are looked up individually, never
loaded as unbounded history. Records remain durable for idempotent retries.
Any retention policy must define its retry window explicitly: deleting a mutation
record ends its replay guarantee. Back up document and mutation tables together.

## Local proof

`test/storage` exercises native SQLite connections and restart, an owned disposable
PostgreSQL cluster when `initdb` and `pg_ctl` exist, and actual local Miniflare/workerd
D1. Tests cover scope isolation, stale CAS, ID collisions, callback rollback,
final authorization/abort checks and immutable staged documents. PostgreSQL tests
skip when local server binaries are unavailable; they never use a production
database URL. D1 tests need the repository's Miniflare dev dependency. SQLite and
Bun SQL require Bun but no separate driver dependency.
