# Console authoring DX implementation and review handoff

## Scope and dependency

Branch: `codex/console-authoring-dx`.
Base dependency: Console optional-assistant candidate
`28e522c54df0c0745cf4e243260962e08d3a3329`, itself based on main
`cf4f7ff1801274914059357f5f827f103297847b`.
The Agent companion `c51c71669822639fa7df0237485a8eab220fabf3` is context only;
this branch has no Agent source change. Resolve the branch's final SHA with
`git rev-parse HEAD` before reviewing. Review the delta `28e522c..HEAD`, not the
inherited assistant implementation. No independent review verdict is claimed.

At final read-only inspection, the owners had advanced the clean Console
candidate to `918d72c8834f1a9929bad11d1f2e6ee4d08f886f` and the clean Agent
candidate to `9fece8e96316b32899f9fa0e242d8a94bbfc35cf`. This branch remains
based on `28e522c`; those later commits were neither integrated nor modified here.

This implements the approved type/client, clean page-consumer and diagnostics
slice, with directory/ownership simplification. Local commit only; no main
integration, push, CI dispatch, registry publication, model call or deployment.
No Delta contact was made. The frozen Console/Agent worktrees were read only.
Relay was inspected for its authoring shape; no Relay source/configuration was
changed or exercised, and no private merchant configuration was read.

## Ownership and directory result

Relay's application-facing `console/` is convenient, but its development closure
also includes vendored Console, contracts, processors and native adapters. Merely
moving Console folders under one directory would retain parallel declarations.

Console now has one `packages/console-authoring` owner instead of separate
`console-sdk`, `console-convention` and `console-dev` facilities. Its public
package name remains `@lenso/console-sdk`; one `lenso-console-author` command
owns init/check/build. The native kit consumes this same compiler/scaffold/SDK,
and no longer copies an additional top-level contract projection into its kit.

Four categories are documented at the authoring entry:

1. Authors maintain `console/page.tsx`, optional `services.ts`, nested pages and
   optional private frontend dependencies. Domain state/auth remain in their Plugin.
2. Console Host, assistant, management MCP and Agent keep real separate product,
   installation and lifecycle boundaries. Native `console-support` is a Host
   compilation boundary, not another page SDK.
3. `.lenso/console/` owns generated declarations/client/provider metadata and assets;
   canonical core contracts own their generated projections. `sdk:generate` copies
   their checked SDK projection, never asks authors to maintain parallel definitions.
4. `src`, `service`, `runtime`, `contracts`, `config`, scripts, tests and docs are
   Console maintenance facilities, not a consumer project scaffold. This bounded
   change does not falsely claim every root folder was removed or merge independent
   security/runtime packages merely to reduce directory count.

## Type and authorization behavior

`operation` retains input/output types; `defineServices` retains literal owner and
operation keys. The installed native TypeScript checker emits declaration-only
service/domain types. The compiler generates the owner-local
`@lenso/console-sdk/services` alias and `bindServices` client before page checking.
It does not evaluate/import authored services during generation. Browser code
contains only the client helper and transport calls; server SDK/source imports
remain rejected. Removing a service clears its generated client before checking,
so a reused output cannot retain obsolete callable types.

There is one handwritten operation declaration, not a page-side DTO/name list.
`defineServices` and `createWorkspaceServices` derive contribution requirements and
exports from it. Cross-Plugin Capabilities still require their normal generated
contracts and explicit bindings; this helper does not create an auth shortcut.
The typed client projects the existing JSON transport; authors must return JSON
DTOs. Compile-time inference is not runtime output validation or a new wire schema.

Public known domain rejection codes survive HTTP translation, preserving 422
status. Unknown errors retain a generic rejection; private parse exception text,
policy state and credentials are not reflected. Browser errors identify public
service/operation. Missing requirements show public alias, capability, descriptor
version and source. Long public identifiers wrap within the existing error view.

## Validation evidence

- Intent inventory: no intent-enabled packages found. Lenso authoring/workflow and
  React best-practices guidance read. Existing UI implementation standard followed.
- `pnpm lint`: pass; `pnpm sdk:check`: pass; canonical SDK projection check: pass.
- `bun test packages/console-authoring/compiler/test`: 5 passed / 41 assertions.
  The clean-consumer test packs the actual public archive, installs it in a fresh
  `/tmp` project, and runs its own scaffold/compiler without repository imports or
  Cargo/Git patches. Domain interface types imported from another file survive
  projection. Wrong service/operation/input/output usage fails strict checking.
  Top-level service evaluation is forbidden during compilation. Server implementation
  markers are absent from browser assets. Emitted services allow 42, deny 99, and
  reject numeric input. Removal clears the client and rejects stale calls.
- Focused Workspace client/catalog unit tests: 11 passed across 2 files.
- Chromium outlet/router tests: 6 passed across 2 files. Long public diagnostic
  identifiers are visible without document overflow at 1280x800 and 390x844 in
  light/dark. Four actual screenshots are in ignored
  `src/features/extensions/__screenshots__/diagnostic-{theme}-{width}.png` and were
  visually inspected. These are component fixtures, not a full live authenticated
  App. Existing error composition/anchors are retained; no control was introduced,
  so additional hover/focus behavior is not applicable. Vitest exits zero but
  retains its existing post-success close-timeout warning.
- Isolated `/tmp/lenso-console-authoring-dx-target`: `cargo test --offline --locked
  -p lenso-console-plugin workspace_services::tests --lib`: 6 passed. The new test
  proves public denied/codec codes through actual mount HTTP dispatch; existing
  tests preserve scoped context, cancellation, owner isolation and admission.
- Same isolated target: Console Plugin lib/test Clippy with `-D warnings`: pass.
- Root Rust format check and Console architecture boundary check: pass. Existing
  unused optional Git-patch warnings remain; no concrete provider/test fixture
  dependency was introduced into the Shell.

## Remaining checks and limits

Full `pnpm typecheck:local` fails at inherited assistant `agent-quick-panel.tsx`
lines 316 and 339 (`opacity` inferred as unknown versus UI XStyle). The exact
`28e522c` source was independently extracted to `/tmp/console-dx-baseline-28e`
and reproduced the same failures using the same locked tool/dependency closure.
This task did not edit the frozen assistant source, mask the errors or claim a
passing full production build. Resolve/integrate the upstream fix, then rerun
full typecheck/build and the one necessary candidate gate on the final SHA.
The later Console candidate contains the corresponding StyleX fix in
`4f2db3d6`; its presence was verified by source diff, not by running this branch
against that new base. The blocker describes this branch's pinned baseline,
not a claim that the latest owner candidate still has the same errors.

The page archive consumer is verified; a newly rebuilt compatible native
Engine development kit is not. Its support metadata path/source digest changed,
so do not reuse an old kit or its previous CI evidence. Native Console/contract
registry readiness and actual registry publication remain separate prerequisites.
No new released Host, signed executable, multi-platform acceptance, runtime hot
installation or published npm alias is claimed by this local branch.

## Suggested independent review

Review the fixed delta against `28e522c`, especially:

- compiler declaration/output paths and no-evaluation behavior;
- literal type retention, transitive domain declarations and stale-client removal;
- browser/server graph exclusion and immutable mount authority;
- HTTP diagnostic allowlist and unknown-error suppression;
- package archive closure and native-kit source digest/path compatibility;
- dependency/lock changes and the inherited full-build blocker.

Independent reviewer should run the focused package/consumer/Rust/browser gates
using their own temporary outputs/target. Do not mutate either frozen candidate
worktree. No landing or publication action is authorized by this handoff.
