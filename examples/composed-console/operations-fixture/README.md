# Isolated operations fixture

Run from repository root with the existing built Console React/SDK packages:

```sh
bun run dev:operations
```

This reuses the actual ComposedConsole host and optional Tasks/Audit bindings.
The Vite test-only envelope invokes real Manage declarations, Scheduler and scoped
Audit services. Authentication/admission is synthetic. Databases are in-memory
SQLite owned by the fixture. No credentials, production plan, user database,
worker driver, model or external account is used. Restarting discards all data.
`lose-ack`, `revoke`, `restore` affect this fixture only. No production host is
modified or automatically registered. Audit uses `additionalPlugins`, the host's
existing optional binding extension; old Tasks hosts stay read-only by default.

Schedules and audit records use their original Lenso UI controls and theme.
The fixture has 52 audit records for cursor navigation and a schedule for explicit
revisioned changes. The fixed listener is 127.0.0.1:18462; do not switch ports or
escalate listening after a refusal. Build with:

```sh
bun node_modules/vite/bin/vite.js build --config examples/composed-console/operations-fixture/vite.config.ts
bun node_modules/typescript/bin/tsc --noEmit -p examples/composed-console/operations-fixture/tsconfig.json
bun run check:operations
```

Current local evidence: build and targeted types/tests pass. Listener startup
reported port in use, while read-only lsof found no listener. No alternate
listener, browser launch or file-URL route was attempted. Browser geometry,
keyboard/focus, theme, double-click, retirement and narrow-width acceptance remain
unverified. Build output is not browser evidence. The composed-wide check exposed
a baseline omission: review-workspace.tsx lacked the SDK's required openSettings
method. The isolated integration now explicitly rejects that unsupported sample
navigation, matching its existing cross-workspace behavior.
