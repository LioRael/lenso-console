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

## Remaining cross-repository boundary: approval/coordination required

No Agent changes or new Agent capability IDs are proposed yet. Reuse:

- `lenso.agent.model@4` 4.3.0: `catalog`, streaming `complete`.
- `lenso.agent@3` 3.2.0: streaming `run_turn`.
- Existing `lenso.agent.model-selection@1`, `lenso.agent.session@1` and
  Host-issued `lenso.agent.turn-binding@1` scope. `turn-processing` is a projection,
  not an invocation API.

The current Agent Web surface has `/models` and interactive `/turns`, but no
independent lightweight completion transport. It cannot safely simulate a model
request by creating an assistant session. Minimum Agent-owner implementation to
coordinate, in a new dedicated Agent worktree:

1. **`crates/lenso-agent-host/src/generation/plugin_ai.rs` (new), plus one module
   declaration in `crates/lenso-agent-host/src/generation.rs`.** Capture the exact
   provider/model selection and active Generation for `complete`; invoke the
   existing typed Model port with cancellation. Add a noninteractive Agent-run
   adapter that uses the existing `run_turn` and Host turn binding, without using
   the web interactive-history handler. Reject unsupported sessionless execution
   rather than secretly creating assistant history.
2. **`apps/lenso-agent-web/src/plugin_ai.rs` (new), plus minimal module/router
   wiring in `apps/lenso-agent-web/src/lib.rs`.** An explicitly Host-bound bridge
   exposes completion and run streams to Console's server adapter. Authenticate
   with existing configured Host authority, validate the exact admitted scope,
   and preserve realm/audience boundaries. Do not edit `run_turn`,
   `run_turn_on_lease`, history leases or history handlers. Avoid adding a second
   runtime loop or implicitly changing the active profile.
3. **`crates/lenso-agent-web-plugin/src/lib.rs` only if the captured Model port is
   unavailable to the existing surface binding.** Extend the native consumer ports
   with existing Model/Model Selection roles, not a new invocation capability.
   First inspect `selected_model_catalog`/Generation routing: reuse that binding
   if it already gives an exact permitted Model handle.

Console-owner adapter/policy follow-up would live in a separately optional
`plugins/agent-ai-adapter`, not the Shell or browser. It must derive consumer from
Host capability binding, user/project from verified authority, then admit before
provider invocation. Administrator purpose profiles narrow exact model allowlists,
token/cost reservations and concurrency. Record admitted and actual model plus
pricing revision; fail visibly on mismatch without fallback. Background execution
stores run/status/usage only. Session ownership is consumer/user/project scoped;
writing an existing assistant session requires an explicit scoped write grant.
Installation/assistant activation must not populate another Plugin's AI/tool grants.

The UI/MCP change itself implements no AI admission policy. A subsequent bounded
checkpoint adds the standalone `plugins/agent-ai-adapter` admission core: exact
caller/model profiles, known pricing revision, trusted input bound, integer budget
reservation, concurrency and actual model/usage evidence. Four synthetic tests
and focused Clippy pass. It is not exposed or linked into the Host: its ledger is
memory only and there is no real provider implementation, authenticated bridge,
durable run record, cross-Plugin session namespace or session-write grant yet.
The matching Agent worktree `feat/plugin-ai-completion` starts at `74f9970` and
adds only a typed, actor-carrying Model lease with no Session or turn acquisition.
Two focused Agent tests pass, including a real fixture completion stream and
Session-list assertions before and after (both empty). This test uses synthetic
identity and does not prove production ingress authorization.
See `plugins/agent-ai-adapter/README.md` for exact unfinished integration.
The existing model/Agent contracts lack a pricing revision field; retain pricing as
Host run evidence first, and request a precise schema change only if observed
provider identity/price cannot be tracked at the adapter boundary.

The independently reviewed Agent history fix `74f9970` belongs in the coordinated
Agent baseline before this follow-up. Its worktree was not modified; no Console
integration requires changing or cherry-picking its history code.

## Local validation and reproduction

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
credential configuration. Latest parent-reported supported quota reading: **5%**;
this environment currently exposes no quota tool. Preserve the below-3% stop line
and continue from this checkpoint only within that budget.
