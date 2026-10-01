# Optional Console assistant: implementation boundary

Base: Console `cf4f7ff1801274914059357f5f827f103297847b`.
Read-only Agent reference: `cceb80f2fb4f36d07abe36d6d0c3a8435e4109e4`.
This candidate is local implementation for review. It is not landed or published.

## Implemented in this candidate

- `@lenso/console` and platform staging contain only the Console Host and Web
  files. No Agent release is resolved, downloaded or started by this packager.
- Console defaults to no Agent connection. Explicit connections and the existing
  combined `lenso-console-with-agent` composition remain supported.
- `package-agent.mjs --native-only` stages `@lenso/agent-native` and a platform
  package containing only the pinned, checksum-verified `lenso-agent` executable.
  Native dispatch checks that executable, not Console or Web assets.
- The existing assistant entry moves from the toolbar to the bottom right.
  Control/Meta+J opens or minimizes it, preserving the retained draft.
  Mobile navigation suspends its surface and shortcut without unmounting drafts.
- History reuses `AgentHistoryMenu` and durable session reads. Closing a panel
  does not delete its backend Session. Resolved-session inputs are shared between
  panel and full-page views, scoped by user, Agent, project and Session. This UI
  draft cache is in memory and bounded to 128 entries; page reload does not restore
  unsent drafts. History is restored from the existing backend.
- Project requests retain their project target and visibly show the project.
  Approval preference storage uses the same structured scope rather than string
  coercion of project objects. This is UI isolation, not backend authorization.
- A blank conversation no longer adopts another request's background activity.
  Reconnection still observes its own pending request or its resolved Session.

## Existing contracts to reuse

Agent owns `lenso.agent.model@4` (`catalog`, streaming `complete`),
`lenso.agent@3` (streaming `run_turn`), `lenso.agent.session@1`,
`lenso.agent.model-selection@1`, and the Host-issued turn-binding scope.
`turn-processing` is a projection pipeline, not an Agent invocation API.

Console owns `lenso.ui.contribution@1` 1.3.0, owner Workspace Services, and the
MCP Management contract/transport. The MCP transport package has no Agent
dependency. Its official-client test
uses a deterministic Management/auth fixture to exercise visible tool binding,
pending/unknown outcomes and revocation. It is a transport library with an
explicit Host bridge, not a registered installable Plugin in the reference
Console App; that activation/lifecycle integration remains to be implemented.

## Coordination required before the remaining implementation

The user requires cross-repository contract changes to be reported first.
No Agent/framework/ai-relay contracts are changed by this candidate.

1. **Global UI contribution, Console owner.** The current contribution descriptor
   admits only workspace page assets and navigation. It has no independent global
   surface mount. Add a separately owned global contribution role and loader,
   retaining the existing React singleton, asset checks, owner services and
   lifecycle/removal proof. The installable assistant package supplies the global
   entry, panel and assistant page; the Shell supplies the generic mount. Existing
   convention compilers must explicitly adopt this role if convention-generated
   packages are to expose it. Do not add a magic Plugin ID or runtime import of
   Shell-private files.
2. **AI admission facade, Agent owner.** Reuse model and Agent operations behind
   a Plugin-bound, Host-authorized entry. Separate a single model request from a
   multi-step Agent run. Host-issued caller scope identifies consumer Plugin,
   authenticated user and project; untrusted request fields cannot establish
   authority. Purpose profiles narrow an administrator allowlist, token/cost
   budgets and concurrency limits. Reserve admission before invoking the provider.
   Keys stay with Host/provider Plugins. Bind exact model/profile and pricing
   revision to run evidence, and fail visibly instead of silently downgrading.
3. **Session/write authority, Agent owner.** Current session open/read/append
   contracts carry Session IDs but no consumer/user/project namespace or assistant
   write grant. Keep session ownership in the Session provider. The facade derives
   isolation from trusted Host scope and validates an explicit session-write grant
   before appending to an existing assistant session. Background runs retain run,
   status and usage evidence without creating assistant history. The actual
   enforcement may use Host-issued extensions where compatible; do not add client
   supplied authorization booleans or create a second history store in Console.

The assistant is still statically built into Console in this candidate. It is
**not yet an independently installable/disableable Plugin**. Native/runtime
installation separation is implemented, but hiding a surface is not removal
proof. The remaining facade, budget admission, pricing evidence and backend
session isolation are not implemented or claimed. Lenso Agent remains the
independent Agent workspace; a future assistant global surface does not become
another peer Agent identity.

## Reproduce local evidence

```sh
pnpm typecheck:local
pnpm build:local
node --test scripts/distribution/launcher.test.mjs scripts/distribution/optional-runtimes.test.mjs
cargo build --offline --locked --manifest-path service/Cargo.toml -p lenso-console-app --bin lenso-console
node scripts/distribution/smoke-console.mjs target/debug/lenso-console dist/client
cargo test --offline --locked --manifest-path plugins/management-mcp/Cargo.toml
pnpm exec vitest run --config vitest.browser.config.ts src/features/agent/agent-quick-panel.browser.test.tsx src/features/agent/agent-execution-state.browser.test.tsx
```

The native smoke stages the actual built Console, removes Agent connection
configuration and puts an empty directory on PATH. It proves HTTP shell startup
and an empty Agent catalog. The browser tests use deterministic API fixtures;
they do not prove live model calls, backend cross-Plugin authority, or publication.
Auth realm/audience code, descriptors and dependency pins are unchanged.

## Local review evidence

- Final Web typecheck/build and standalone native Console build passed.
- Actual staged Console startup passed with empty PATH, no Agent connection,
  HTTP shell success and an empty Agent catalog.
- Distribution tests: 13 passed; the pre-existing development-kit integration
  test is opt-in and was skipped. Native-only packaging uses an offline,
  checksum-verified executable fixture; no release assets were downloaded.
- Chromium assistant/execution browser suite: 24 passed, including navigation
  suspension, close/reopen history, shared input, project switching and rejection
  of unrelated background activity. Vitest reports its existing process teardown
  timeout after successful tests and exits successfully.
- Focused history/execution/runtime unit tests: 48 passed.
- MCP official-client transport fixture: 1 passed with no Agent loaded. Existing
  session/auth focused tests: 3 passed. This is not proof of a newly installable
  MCP Plugin, assistant Plugin lifecycle or backend AI admission policy.
- Console dependency boundary, Rust format and changed-source lint passed.
- Playwright rendered review covered 1280x800 and 390x844, light/dark, hover,
  focus, shortcut, open/minimized panel, no horizontal overflow and no duplicate
  toolbar entry. Agent responses were fixtures; no models were called.

No remote CI, landing, push, publication or deployment was performed. The last
successful quota read showed 8% remaining; subsequent supported quota calls
returned `Transport closed`, so fresh quota could not be established. Remaining
cross-repository contracts await the requested boundary coordination.
