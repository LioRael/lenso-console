# Optional Console assistant: implementation and coordination checkpoint

Console base: `cf4f7ff1801274914059357f5f827f103297847b`.
First local commit: `f11a7d9d0686577a2879c3f9ef01130884233e22`.
Task checkout: `/Users/leosouthey/Projects/framework/.worktrees/lenso-console/feat-optional-assistant`.
Read-only Agent checkout: `/Users/leosouthey/Projects/framework/lenso-agent-harness`,
remote `LioRael/lenso-agent`, inspected SHA `cceb80f2fb4f36d07abe36d6d0c3a8435e4109e4`.
Reference Console checkout `/Users/leosouthey/.codex/worktrees/a3b0/lenso-console`
was read only. No framework or ai-relay files were changed.

This is local implementation for review, without remote CI, landing or publication.

## Implemented

- `@lenso/console` staging contains only the Console Host and core Web files.
  Console has no default Agent connection and does not resolve/download/start Agent.
- `package-agent.mjs --native-only` stages the checksum-pinned independent
  `@lenso/agent-native` executable without Console/Web files. Existing combined
  distribution remains available.
- **Assistant is now an optional native Plugin and independently built UI package.**
  `plugins/assistant` provides `lenso.ui.global-contribution@1`. Console Shell
  imports the generic global outlet, never the assistant component. The default
  reference Host build excludes the assistant Cargo dependency. Build its optional
  provider with `--features assistant`; an explicit installed asset directory and
  Agent origin are required before activation. Activation checks Agent readiness,
  and never downloads or starts it.
- `build-assistant.mjs` builds independent JS/CSS and rendering chunks.
  `package-assistant.mjs` stages only those reviewed assets and an exact-version
  dependency on `@lenso/agent-native`; no Console binary or core Web is copied.
  These npm packages are local, unpublished candidates.
- Native Plugin Root disable markers remove the global capability binding, mount
  and asset URLs. Re-enable restores them. The reference Host uses an immutable
  App Plan, so changing Root enable state takes effect after Host restart; this
  candidate does not claim in-process hot installation/reconciliation.
- The global UI catalog is separate from workspace navigation and lazily imports
  only trusted, enabled contributions with satisfied requirements. It reuses the
  workspace asset validation/digests, React singleton, owner services and render
  error boundary. New global role leaves existing workspace contract unchanged.
- Assistant UI remains bottom-right, without a duplicate header entry. Ctrl/Meta+J,
  history and full-page navigation reuse the existing Agent session APIs. Resolved
  session drafts share one bounded in-memory cache by user/Agent/project/session;
  unsent drafts are not persisted across page reload. Project context is visible.
  Mobile navigation suspends the UI without unmounting drafts. Blank conversations
  do not adopt unrelated background activity. Plugin draft handoff becomes disabled
  when no assistant panel is registered.
- **Management MCP is now a registered optional native lifecycle Plugin.**
  `lenso.console.management-mcp` provides the existing HTTP stream endpoint role
  and requires exactly Auth and Management ports. Its optional build feature is
  `management-mcp`, independent of assistant/Agent. It mounts the existing MCP
  transport through ingress, forwards caller credentials, preserves realm/audience
  checks and read-only defaults, and shuts down its bridge on deactivation.
  The reference Host accepts an explicit MCP profile file and fails closed if its
  required Auth/Management providers are missing. It does not create credentials
  or install the Operators/Management authority stack automatically.

## Exact local boundary

| Owner | Files/paths | Contract / reuse |
| --- | --- | --- |
| Console | `contracts/crates/lenso-capability-ui-global-contribution/{capability.json,schemas/,src/generated.rs,generated/bindings.ts}` | New `lenso.ui.global-contribution@1` 1.0.0, reuse contribution payload/asset/requirement vocabulary; existing `lenso.ui.contribution@1` 1.3.0 unchanged |
| Console | `service/src/{lib.rs,page_contributions.rs}`; `src/features/extensions/{global-contribution-outlet.tsx,global-ui-runtime.ts,page-contribution-outlet.tsx}` | Generic mount/catalog, existing owner Workspace Service dispatch and renderer |
| Console | `plugins/assistant/{Cargo.toml,config.schema.json,src/lib.rs,web/entry.tsx}`; `scripts/distribution/{build-assistant.mjs,package-assistant.mjs}` | Optional native provider plus separate browser package; public singleton adapter names in `global-ui-runtime.ts`; no runtime import of Shell-private files |
| Console | `plugins/management-mcp/{Cargo.toml,config.schema.json,src/lib.rs,src/plugin.rs}` | Existing `lenso.auth@1`, `lenso.management@1`, `lenso.http.stream-endpoint@1`; no Agent role or new MCP contract |
| Console | `service/crates/lenso-console-app/{Cargo.toml,src/config.rs,src/lib.rs,src/tests.rs}` | Optional installation features and explicit enable configuration; existing Plugin Root lifecycle |

Build-time assistant source reuse is intentional. The independently delivered
browser package resolves shared UI state/HTTP through the named singleton adapter
map, preserving the actual authenticated subject, CSRF transport, router, Query
Client and draft cache. This is a browser ABI, not an AI authorization capability.

## Coordinated background completion boundary

Console now owns the optional `plugins/agent-ai-adapter` native provider and
SQLite schema-v1 reservation/run ledger. It reuses `lenso.ui.workspace-service@1`
with service `ai` and unary `complete`; no new AI capability ID or Framework/Relay
change. The reference Host selects it only with feature `agent-ai` and explicit
Host configuration. Installing the assistant does not issue consumer/actor grants.

Kernel supplies caller Instance. An immutable operators verifier supplies user;
Host policy selects exactly one project for that caller/user. Bodies cannot select
project, profile, credentials, price or budget. Model allowlist is one exact model
per bound profile; use explicitly bound instances for other purposes/projects.
Known pricing revision, catalog hard input ceiling, checked integer reservation
and concurrency are required before completion. Binding/Generation and actual
usage are recorded. Unknown results/cancellation keep the full reservation.
Policy changes, incompatible databases and lost storage fail closed. Crash-left
reservations require explicit reconciliation rather than automatic refund.

The Agent branch `feat/plugin-ai-completion` starts at the already reviewed
`74f9970`. Changes are confined to `generation/plugin_ai.rs`, Web
`plugin_ai.rs`, module/command/router/Host configuration wiring and dependencies.
`standalone.rs` adds an explicit existing-authority file option. Existing history
handlers and interactive `run_turn`/`run_turn_on_lease` are preserved.
Coordinated local Agent commit: `09e827997e0a22c7179d465f3e31787c8241b848`
(includes lease checkpoint `10b988c`). Both await delivery review; no remote landing.

Agent captures the existing `lenso.agent.model@4` 4.3.0 binding without a Session,
Turn or Tool lease. The optional Web bridge requires BOTH the existing private
Host control seam and a signed user assertion with exact Model complete audience.
Loopback/local access or an assertion alone does not authorize it. Console also
verifies its own Workspace Service invoke audience. The standalone bridge is
closed by default; no credential is generated. Cancel is owner scoped; output,
request sizes and deadlines are bounded. Quoted Generation and input ceiling are
rechecked before paid invocation. No retry or alternate model is selected.

The Model contract does not carry actual vendor model identity or price revision.
Evidence records the exact requested model, bound provider Instance/Generation
and Host-configured pricing revision; it cannot detect internal substitution by
an otherwise trusted provider or claim a vendor billing receipt. Missing pricing,
model ceilings or final usage fails closed. Reservations use the full provider
input ceiling, not a consumer token estimate.

Actual Console Kernel binding was exercised against a separate Agent fixture
process. Missing Host control, foreign issuer, wrong audience, caller impersonation
and unsigned project selection are rejected. Cancel/provider failure leaves
charged unknown runs. Session lists before and after remain empty. No paid call.
See `plugins/agent-ai-adapter/README.md` and ADR 0012 for configuration/evidence;
Agent ADR 0118 records its transport/security boundary.

Still unimplemented: multi-round `lenso.agent@3` run admission, consumer/user/project
interactive session namespace and explicit existing-assistant Session-write grant;
policy/ledger migration and reconciliation of unknown crash-run execution. This
is a usable background completion slice, not delivery of all cross-Plugin AI goals. No Model Selection/Session/Turn Binding contracts are changed.

## Local validation and reproduction

Final background-completion checks: five policy/durable tests, one explicitly
enabled cross-process Kernel/HTTP fixture test, two Agent completion lease tests
and the assistant disable/re-enable regression with all optional features passed.
Console adapter/reference Host and Agent Host/Web (including standalone binaries
and tests) passed focused Clippy with warnings denied. Default Console check
passed and its dependency graph excludes all three optional providers. Logs:
`/tmp/lenso-ai-bridge-cross-process.log`, `/tmp/lenso-ai-bridge-console-unit.log`,
`/tmp/lenso-ai-bridge-agent-host-test.log`,
`/tmp/lenso-ai-bridge-assistant-regression.log`,
`/tmp/lenso-ai-bridge-console-final-clippy.log`,
`/tmp/lenso-ai-bridge-agent-final-clippy.log`.
The loopback fixture tests required sandbox escalation because socket binding
was initially denied; the authorized local tests then passed. No external network.

```sh
pnpm build:local
node scripts/distribution/build-assistant.mjs
node scripts/distribution/package-assistant.mjs plugins/assistant/web/dist /tmp/assistant-package
cargo build --offline --locked -p lenso-console-app --bin lenso-console
node scripts/distribution/smoke-console.mjs target/debug/lenso-console dist/client
cargo test --offline --locked -p lenso-console-app --features assistant,management-mcp optional_assistant_disable_removes_global_mount_and_assets
cargo test --offline --locked -p lenso-management-mcp
pnpm exec vitest run --config vitest.browser.config.ts src/features/agent/agent-quick-panel.browser.test.tsx src/features/extensions/page-contribution-outlet.browser.test.tsx
```

Focused browser suite: 28 passed. Native assistant disable/re-enable test passed
and asserts mount, asset and capability removal. Actual separately built module
was rendered through the native Console Host in Chromium: single entry, shared
React/providers, keyboard and unsent draft, desktop 1280x800, narrow 390x844 dark,
no horizontal overflow, disable removes UI/styles, re-enable restores, no page
errors. Screenshots: `/tmp/lenso-optional-plugin-desktop.png` and
`/tmp/lenso-optional-plugin-narrow-dark.png`. All Agent responses were fixtures;
no paid model calls occurred. Four focused MCP tests passed, including actual
native Plugin activation, metadata response and shutdown without Agent, required
Auth/Management ports, cancellation, and existing client transport behavior.
The assistant package closure test passed. Default native Console build and
no-Agent startup, MCP-only feature check, optional assistant native build, Core
web build/type check, focused lint, formatting, Clippy with warnings denied and
repository boundary checks all passed.
Vitest reports its existing teardown timeout after successful tests, with exit 0.

Auth realm/audience code, existing contract versions and upstream dependency pins
are unchanged. No remote checks/push/main advancement/publishing/deployment or new
credential configuration. The user removed the quota stop requirement during continuation.

## Completed scoped run continuation

`ai.run` now reuses the existing Agent Loop inside a task Kernel with exact
retained parent bindings. The new native run boundary counts and meters every
Model open, narrows Tools and preserves final Tool Hook/provider checks. Console
reserves all permitted calls before dispatch. Background Session history is
bounded memory discarded at shutdown; no assistant Session is opened.

Explicit `open_session`, `register_session`, `grant_session` and `revoke_grant`
operations separate plugin/user/project history and owner-authorized writes to
an existing assistant Session. A separate WAL/FULL authority database preserves
the old completion ledger schema. Grant expiry/revocation and current signed
Agent/Session audiences are checked before, during and after execution. Native
Session namespace baggage leaves existing wire contracts and root ownership
unchanged. Agent ADR 0119 records the cross-repository boundary.

The real cross-process scoped test passed: two Model calls plus the synthetic
uppercase Tool; zero persistent background history; owner verification; explicit
recipient grant; cross-project denial; cancellation after revocation; isolated
plugin Session; exactly two explicitly requested Sessions. Fixture Tools require
explicit existing Hook allow policy. No Full/Assisted approval, nested Agent or
unmetered code-mode execution is inherited. The task lifecycle guard is retained
until Kernel shutdown and successful terminal receipts support conservative
recovery. Known-price reservations and previous completion/revocation behavior
remain covered.

Focused Console and Agent Host/Web Clippy passed with warnings denied. Evidence:
`/tmp/lenso-console-run-e2e.log`, `/tmp/lenso-plugin-run-host-test.log`,
`/tmp/lenso-console-run-clippy.log`, `/tmp/lenso-plugin-run-clippy.log`.
These are local implementation candidates for coordinated review; no landing,
remote gate, publication, deployment or paid call has occurred. Operational
limitations are explicit: native trust boundary, authenticated SQLite for scoped
history, no attachments/artifacts/compaction/secondary unmetered Model calls,
and fail-closed recovery when successful terminal receipts are lost.

Final continuation validation: 6 Console unit tests, 2 actual cross-process tests,
14 SQLite Session regressions, real Loop two-call/scoped task test, and pending
Model-open cancellation regression passed. Default Console and MCP-only checks,
Console Host/adapter and Agent Host/Web strict Clippy, formatting and diff checks
passed. Default graph excludes Agent Host/Web/default Plugins and all three
optional Console providers. Authenticated SQLite is explicitly required before
any persistent plugin Session admission; a plain or file provider is rejected.
Native macOS test linking reports the existing large `__eh_frame` warning; tests
still pass. Intent skill discovery was attempted but npm access was unavailable;
repository Lenso Plugin Authoring instructions were used.

Review pair: Agent `44b1120` on `feat/plugin-ai-completion` (parent `1c7800d`),
Console continuation on `feat/optional-assistant` (parent `baaccbd`). Existing
review references `09e827` / `6b13c9e` remain unchanged ancestors. These branches
retain their isolated original bases; current destination branches may have
advanced independently and must be reconciled in Delta before a new candidate
CI gate and exact-SHA landing. No remote branch was pushed.
