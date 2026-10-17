# Optional task Console page

Private workspace module for existing local `ConsoleShell` hosts. It starts no
worker, scheduler or credential store. Reads refresh every three seconds while
the page is visible, and on reconnect/focus; unmount stops monitoring. The application owns
admission, the trusted resource binding and its authenticated Manage transport.

```tsx
import { createTaskClient } from "@lenso/console-tasks/client";

const tasks = createTaskClient({
  tasks: "application.tasks", // exact installed Console Tasks integration ID
  invoke: (service, method, input, signal) =>
    authorizedInvoke(service, method, input, signal),
  retry: true,
  cancel: true,
});
// Existing examples/composed-console host; other required props stay app-owned.
<ComposedConsole {...applicationClients} tasks={tasks} />;
```

`ComposedConsole` installs `/tasks` only when this client is supplied. For other
local hosts, append `tasksConsole({ id, route, client })` from
`@lenso/console-tasks/react` to their existing bindings. Retry/cancel flags control
presentation, never authorization. Use `createConsoleTasksIntegration` from
`@lenso/console/tasks` on the server with `authorizeJob` and explicit `safeRetry`.
The adapter passes the activation signal, validates the target job in responses,
and strips raw payloads/results and arbitrary error text. Successful details may
include bounded `resultText` explicitly approved by the server host. Do not expose raw queues.

Tasks 0.4.0 exposes no exact retry/execution timestamp. Pending/running jobs show
**Not provided by the queue API**; terminal jobs show **Not scheduled**. An optional
`scheduler` service's `nextAt` is a separate next trigger, never a job retry time.
The page reads bounded pages and offers contextual recovery. Writes require a
specific target confirmation and synchronous duplicate guard. After an uncertain
acknowledgement, **Check status** reconciles the durable state before another write.

## Verification

From the repository root, after normal workspace installation and existing
Console React/Console/optional-plugin builds:

- `bun run --cwd packages/console-tasks typecheck`
- `bun run --cwd packages/console-tasks test`
- `bun run --cwd packages/console-tasks test:browser`
- `bun run check:composed`

The browser tests use the actual ComposedConsole binding, pinned headless Chromium,
a test-only HTTP envelope, real Manage operation bindings, Console Tasks ownership
checks and Tasks D1-provider SQL against a temporary SQLite file. Authentication is
synthetic. Other ComposedConsole pages use sample clients. This does not prove
production OAuth, Cloudflare D1 hosting or a new production transport.

Proof covers read recovery, confirmed retry/cancellation, duplicate submission,
a retry committed before its acknowledgement is lost, status reconciliation,
revocation, hidden foreign-tenant jobs, Escape/focus restoration and narrow
light/dark dialogs. The client test also reopens SQLite to verify durable state.
Screenshots are under `/tmp/lenso-tasks-proof/`. Existing backend authorization tests remain in
`packages/console/test/tasks.test.ts`. No user tasks or databases are accessed.

Root local/browser/typecheck gates include this module. It remains private and
unpublished; compiling an admitted SDK page is a separate authoring contract.

## Recovering long tasks and results

Reloading or signing back in fetches authorized jobs from the durable queue again.
Open **View task** to read the persisted state and result. The page never stores
results in browser storage. Offline status describes connectivity, not execution:
last-known task state remains visible, writes are disabled offline, and reconnect
reconciles status automatically without replaying retry/cancel requests. A failed
read likewise does not mean the task failed or was cancelled.

The task owner must persist results using the existing Tasks `defineTask.result`
projection. To disclose a safe text summary, opt in on the existing server adapter:

```ts
createConsoleTasksIntegration({
  ...existingOptions,
  describeResult: (_trusted, job) => reportResult.parse(job.result).publicText,
});
```

`describeResult` is called only for an authorized successful job; it returns text
(up to 16000 characters) or null. Ownership and authentication are checked again
after the projection resolves. There is no raw-result fallback, HTML rendering,
new endpoint or browser cache. Without the projection, the UI says no result is
available. Queue retention remains the owner's responsibility; pruned jobs and
results discarded by a task cannot be recovered by Console. Pagination starts
at the first page after a reload/session change; no opaque cursor is persisted.

The long-task browser fixture executes a real deferred handler via Tasks with
SQLite-backed D1 SQL and real Manage, toggles Chromium offline while execution
finishes, then recovers the result after reconnect, reload and synthetic sign-in.
The client fixture additionally reopens SQLite and verifies persisted output.
