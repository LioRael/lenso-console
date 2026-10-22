# Scoped audit browser

Private optional local ConsoleShell binding. Use `createAuditClient` from
`@lenso/console-audit/client` with the application's already authenticated,
exact scoped Audit service, then `auditConsole({id, route, client})` from
`@lenso/console-audit/react`. No credentials, scope selector or global lookup
is introduced. Use the existing `createConsoleAuditIntegration` on the server;
trusted host binding resolves principal and tenant/scope on every query/get.

Filters are action, full target, result and correlation ID. Cursor pagination
uses the submitted filter snapshot; new submissions reset the cursor. Details
and outcome/correction links always perform authorized reads in the same
service. Missing or revoked records show unavailable. The page projects bounded
metadata and deliberately omits raw payloads, arbitrary summary and actor data.
No export, mutation or automatic business retry is offered. A log record is
historical evidence and cannot stand in for a business submission receipt.

`test` proves projection and strict filter boundaries. The existing Console Audit
test consumes this adapter through the real Console Fetch transport with an
in-memory SQLite repository, foreign tenant, revocation and correction reads.
Browser geometry, keyboard and lifecycle require the isolated composed fixture.
