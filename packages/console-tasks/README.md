# Optional task Console page

Owns only the task/schedule presentation and browser response adapter. It borrows the existing Console Tasks integration and Scheduler Manage companion; it starts no worker, scheduler, Host, credential store or background poller. Login, SDK, Shell and task-kernel files are untouched. The module is private pending application-owner integration; no root lockfile changes are included.

`tasksConsole({ id, route, client })` returns an ordinary `ConsoleBinding` for the existing `ConsoleShell.plugins` list. `createTaskClient({ invoke, tasks, scheduler?, retry?, cancel? })` adapts the application's already authenticated Manage transport; `invoke(service, method, input, signal)` must call that transport, preserving its session and resource binding. Service IDs are the existing installed integration IDs. Explicit retry/cancel options control presentation only; backend authorization and replay safety remain mandatory. Do not bind queue objects or credentials into browser code.

Compatibility: Console React local binding/activation API at main `725205b`, Lenso UI 0.9.1 Modal and attached Toolbar, Tasks integration list/get/retry/cancel and Scheduler list. The browser validates response shape, strips unknown fields, and distinguishes accepted retry, requested cancellation, cancelled and already-terminal outcomes. No raw input/result or arbitrary server error text is rendered.

The current Tasks 0.4.0 status contract does **not** expose the persisted execution/retry timestamp. Pending jobs honestly show “Not provided by the queue API”; terminal jobs show “Not scheduled”. Scheduler `nextAt` is displayed separately as a next trigger, never mislabeled as a job retry. Exposing exact task retry time requires an owner-approved public task contract extension and is outside this module's kernel-free scope.

The UI reads one bounded page, preserves the last page on failure, and offers contextual error recovery. Details and writes are activation-scoped, requests carry the lifetime signal, writes require target-specific confirmation and a synchronous duplicate-submit lock. A failed acknowledgement requires status reconciliation before another confirmation. No permanent generic refresh button.

## Local verification / preview

Use the repository's Bun version and installed workspace dependencies. Build Console React with its existing build script first. From this directory:

- `bun run typecheck`
- `bun run test` — adapter validation and real D1-provider SQL against a temporary local SQLite file, including reopen durability.
- `bun run test:browser` — existing ConsoleShell, headless Chromium, fake task transport, confirmation/duplicate-submit/recovery/Escape-focus/narrow geometry/empty-state checks.
- `bun run dev` — localhost-only fake-data preview at port 18442. Optional `?read-error`, `?write-error`, `?empty`, `?dark` exercise recovery and themes. This is the test fixture, not a new backend.

Existing backend security coverage remains `bun test packages/console/test/tasks.test.ts` from repository root. Browser screenshots go to the invoking directory's `output/playwright/`. No test touches user tasks or databases.

Integration owner: add this directory to root workspaces and reconcile the root lockfile when selecting this optional module. The only application-level patch needed is adding its returned binding to the application's existing `ConsoleShell.plugins`, using that application's authorized transport. No default production navigation is installed implicitly.
