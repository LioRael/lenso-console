# Console authoring DX implementation and review handoff

## Scope and dependency

Branch: `codex/console-authoring-dx`.
Base dependency: Console optional-assistant candidate
`28e522c54df0c0745cf4e243260962e08d3a3329`, itself based on main
`cf4f7ff1801274914059357f5f827f103297847b`.
The Agent companion `c51c71669822639fa7df0237485a8eab220fabf3` is context only;
this branch has no Agent source change. Resolve the branch's final SHA with
`git rev-parse HEAD` before reviewing. Review the delta `918d72c..HEAD`, not the
inherited assistant implementation. No independent review verdict is claimed.

The first local authoring commit is
`b5adb2539e3e11c1eff9ff667f1866d2959f7683` against `28e522c`.
After the coordinator confirmed fixed writer candidates, this branch integrated
Console `918d72c8834f1a9929bad11d1f2e6ee4d08f886f` through local merge
`6b910d22ee3c847ef5ad1f4259f8776f8784aa78`. Agent
`9fece8e96316b32899f9fa0e242d8a94bbfc35cf` remains context only. No uncommitted
writer content was copied. Review the final authoring delta against `918d72c`,
while the original `28e522c..b5adb253` remains available for provenance.

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

The exact top-level directory set is unchanged: `.agents`, `.changeset`, `.github`,
`config`, `contracts`, `docs`, `examples`, `packages`, `plugins`, `public`,
`runtime`, `scripts`, `service`, `src`. Under `packages`, the before set is
`agent`, `console`, `console-support`, `console-sdk`, `console-convention`,
`console-dev`; the after set is `agent`, `console`, `console-support`,
`console-authoring`. Thus this is real consolidation of the page authoring tool
owner and declaration authority, not completed consolidation of the entire
Console repository. Internal service/runtime/configuration and release workflows
remain maintenance work. Capability schemas/descriptors, macro-generated native
Plugin descriptors and Host admission keep distinct, necessary owners.

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
The `then` alias/member is explicitly rejected rather than advertised as a callable
method while suppressed by the Proxy to avoid Promise assimilation.

`init` and the Engine kit default to page-only navigation. `init --services` adds
the separate service example. This distinction is required by actual Host
admission, not an attempt to label source compilation as a running service.

Public known domain rejection codes survive HTTP translation, preserving 422
status. Unknown errors retain a generic rejection; private parse exception text,
policy state and credentials are not reflected. Browser errors identify public
service/operation. Missing requirements show public alias, capability, descriptor
version and source. Long public identifiers wrap within the existing error view.

## Validation evidence

- Intent inventory: no intent-enabled packages found. Lenso authoring/workflow and
  React best-practices guidance read. Existing UI implementation standard followed.
- `pnpm lint`: pass; `pnpm sdk:check`: pass; canonical SDK projection check: pass.
- `bun test packages/console-authoring/compiler/test`: 6 passed / 45 assertions.
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

## Integrated validation and remaining checks

Before integration, full `pnpm typecheck:local` failed at inherited assistant `agent-quick-panel.tsx`
lines 316 and 339 (`opacity` inferred as unknown versus UI XStyle). The exact
`28e522c` source was independently extracted to `/tmp/console-dx-baseline-28e`
and reproduced the same failures using the same locked tool/dependency closure.
This task did not edit the frozen assistant source, mask the errors or claim a
passing full production build at that point. Following the authorized integration,
`pnpm service:web-build` passes both the full TypeScript check and production
build/prerender. The first build attempt was blocked only by sandbox loopback
listener restrictions; the same command passed with local listener permission.

Integrated local tests covered 275 tests: 259 passed in the full run; the 16
middleware tests blocked by sandbox listening restrictions all passed in their
isolated rerun. The browser run had 100/101 passing with one hover submenu failure;
an overlapping isolated run passed that assertion but failed the hover tooltip.
A subsequent isolated run with no other browser suite passed all four composer
tests. The full suite is not described as a single green run. No helper UI was
edited to hide these observed timing failures.
A full serial rerun also had 100/101 passing, failing the quick-panel permission
submenu hover. An immutable `918d72c` snapshot independently passed both affected
files (27 tests). Thus the isolated tests pass, but the exact full-suite hover
timing cause remains unresolved; this is not presented as a proven baseline bug.

Current Engine main was independently confirmed through read-only remote lookup
as `29b01e47d9b4c136f48a2a131ce5622087562512`, Engine Host 0.2.5. Its exact source
snapshot builds offline/locked in `/tmp/console-authoring-integration-20261002`,
with a task-owned Cargo target. The primary core checkout was older and was not
used as evidence of current Engine compatibility.

The first current-Engine seed build found the standalone `console-support` lock
still at SDK 0.5.23. Cargo metadata refreshed only its required closure to the
existing Console SDK 0.5.28 (no broad package refresh). The subsequent build
synchronized eight contract packages and compiled the page source, then failed
assembling the native Host: Engine's Web ingress 0.4.11/HTTP stream 0.1.4 require
codegen =0.10.2, while the selected Console HTTP endpoint 0.3.6 requires =0.10.1.
The pinned Auth human-token contract also requires =0.10.1. Do not bypass the
conflict through alternate generated manifests or private dependency patches.

The authorization to make minimal cohort adjustments was received, but the exact
Auth main remains `1d101fbc9ba1efc12aaa2cf459628e6383100264`, with SDK =0.5.28 and
codegen =0.10.1. A blanket Console version substitution cannot solve that external
constraint. No new Auth source, private patch, unreleased Git pin or upstream
worktree change was introduced.

The independent native build also exposed a source split hidden by root patches:
Console imported registry Auth types while its Auth SDK imported the same-version
Git Role. `service/Cargo.toml` now directly selects that SDK's existing exact Git
Capability source. Roles, schemas and authorization behavior are unchanged. The
standalone support lock was refreshed by Cargo metadata, preserving unrelated
versions. Root locked metadata and focused Console Plugin Clippy pass.

## Rebuilt current-consumer kit

The page-only native seed was rebuilt through the normal App assembly path using
producer `119b9af70b82816588c00c8bf812f7c62d1a18b5`, whose SDK 0.5.28, HTTP 0.3.6,
codegen 0.10.1 and Web ingress 0.4.10 match the selected Console graph. The packager
then installed the unmodified current Engine 0.2.5 binary from `29b01e47` as the
consumer. These are intentionally recorded as two source revisions, not one
passing current-Engine automatic native-producer result.

The archive was extracted and its page-only lifecycle gate passed with PATH
containing only kit binaries: App creation, build, readiness/shutdown, real HTTP
Shell and generated module reads, Console removal, zero-Instance build/start,
wrong-target rejection and no Cargo Host cache. The compiler's kit fallback now
checks a complete installed checker/type closure, avoiding ambient Bun cache
resolution. Bootstrap tools are retained in source-local ignored
`.lenso/console-authoring-tools`, outside the symlink-free Plugin output; temporary
typecheck files are removed, and the editor projection retains valid tool paths.

Local archive: `/tmp/console-authoring-integration-20261002/development-host-v3.tar.gz`.
Its digest and exact test output are recorded alongside it in the integration
directory. No registry, signature, Linux result or download release is implied.
SHA-256: `0f89084bc1adcffaa07d071e74f509d112cd4c48e1a5791356dced51080f955a`.

The explicit service consumer gate remains separate. The full WorkspaceService
Role contains `subscribe` Stream, while Engine's Bun App Host declares Request
only. Even unary authored services publish that complete Role and are therefore
rejected before runtime. The source helper and focused native HTTP tests prove
authorization/diagnostic behavior, not this unavailable portable runtime path.
The service gate remains opt-in through `LENSO_CONSOLE_DEV_KIT_SERVICES=1` and its
actual failure is retained. No contract operation was stripped and no Host target
capability flag was raised to conceal the rejection.

For follow-up, a current automatic native producer requires a coordinated public
Auth/codegen source cohort; a portable service runtime requires Engine Host
qualification of the existing Stream path or an explicitly versioned request-only
Role design. Neither is a cosmetic Console directory change. Any Role change must
retain its compatibility decision and generated schemas, and any Host extension
must prove lifecycle, cancellation and bound authority before advertising Stream.
The existing workflow's old independently pinned Engine source/default and native
platform matrix also need separate reconciliation before delivery. No remote
candidate gate or publication was dispatched in this local scope.

The page archive and rebuilt current-Engine page-only kit consumers are verified;
the full portable service consumer is blocked. Do not reuse an old kit or its
previous CI evidence. Native Console/contract
registry readiness and actual registry publication remain separate prerequisites.
No new released Host, signed executable, multi-platform acceptance, runtime hot
installation or published npm alias is claimed by this local branch.

## Suggested independent review

Review the fixed authoring delta against `918d72c`, especially:

- compiler declaration/output paths and no-evaluation behavior;
- literal type retention, transitive domain declarations and stale-client removal;
- browser/server graph exclusion and immutable mount authority;
- HTTP diagnostic allowlist and unknown-error suppression;
- package archive closure and native-kit source digest/path compatibility;
- direct Auth Role source identity and conservative standalone lock refresh;
- separate producer/consumer cohort evidence, Stream admission blocker and
  unresolved full-suite hover timing.

Independent reviewer should run the focused package/consumer/Rust/browser gates
using their own temporary outputs/target. Do not mutate either frozen candidate
worktree. No landing or publication action is authorized by this handoff.
