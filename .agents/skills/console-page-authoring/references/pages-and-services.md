# Pages and owner services

## Page source

Read the [authoring guide](../../../../packages/console-authoring/README.md)
and [SDK page contract](../../../../packages/console-authoring/src/index.ts).
Use the installed scaffold when creating a new entry:

```sh
bun run lenso-console-author init console
# Select this variant when the owner needs the typed service example:
bun run lenso-console-author init console --services
```

The conventions include `page.tsx`, nested pages, optional layouts and
loading/error/not-found boundaries. `[id]` is a string parameter; catch-all
segments are arrays and terminal. Let the compiler reject ambiguity rather
than introducing a second router.

Import `PageProps`/`definePage` from `@lenso/console-sdk`; import React integrations
from `@lenso/console-sdk/react`. Use `navigation.href`, `navigation.go`, `Link`,
or `useWorkspace` with mount-relative segments. A compiled mount and a local
`ConsoleShell` binding have different page props and navigation shapes.

Use `defineWorkspace` for genuinely separate member/admin workspaces. Explicit
workspace IDs, service requirements, index routes, and paths describe the owner's
contract. `access: "administrator"` requests a host boundary; it grants no role.
Page registration does not necessarily create a global navigation item.

The host supplies its React runtime and lifecycle. Use its existing root,
navigation, locale, and cancellation contexts. Mutable state belongs to each
installation/mount, even when immutable implementation imports are shared.

## Services

The plugin's optional root `services.ts` imports `defineServices`, `operation`,
and, for an explicit read stream, `streamOperation` from
`@lenso/console-sdk/server`. Consult the
[actual declarations](../../../../packages/console-authoring/src/server.ts).

Every operation has `parse`, `authorize`, and `handle`:

- Parse untrusted input before domain dispatch.
- Authorize using the business owner's real policy and admitted trusted context.
- Handle by adapting the existing domain service, not duplicating its storage
  or business implementation in Console.

The declared
[operation context](../../../../packages/console-authoring/src/service-types.ts)
contains mount/owner/subject metadata and a signal. It does not declare an
authenticated actor. Do not invent `context.actor` or treat a subject ID as
Auth evidence. If the existing service needs evidence not exposed here, establish
the supported trusted binding with the application owner before implementing it.

Pages consume the compiler-generated `bindServices` from
`@lenso/console-sdk/services`, binding `props.services`. This is a generated
owner-local alias, not a global importable service registry. Use the generated
`tsconfig.authoring.json`; browser pages do not import `services.ts` or `/server`.
Type inference does not replace runtime validation or bounded public DTOs.

An operation's request signal cancels pending work and retired responses; abort
does not roll back a completed business mutation. Capture targets and reuse the
owner's confirmation/idempotency policy for writes.

## Async reads and language

Only when those branches are needed, consult the installed SDK guide for
`useWorkspaceRead` and its read-refresh policy, or `useConsoleLocale` from
`@lenso/console-sdk/react/locale` and translations from `/i18n`.
Cache by real mount/session scope, not `pageId` alone. Treat activation as a
lifetime guard, not a permission; check `isCurrent()` before committing late
results where the host provides it.

The [service scaffold](../../../../packages/console-authoring/service-example/services.ts)
is example data with an illustrative policy. It is not a production ownership
recipe or a reason to manufacture successful authorization.
