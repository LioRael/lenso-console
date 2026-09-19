# App-owned Console implementation

Console support owns the browser SDK, page convention compiler, Shell, UI
Contribution and Workspace Service contracts. Engine owns generic directory
selection and compiler execution. Agent owns tool declarations and policy.

An application selects support explicitly. Console startup must succeed with no
Agent. A selected console directory compiles to one contribution Plugin, using
immutable bundled assets and existing Plan-bound contracts. Removing support
must avoid reading/installing private frontend packages and remove contributions.

Validation targets: real App startup without Agent; root and dynamic page routes;
shared React hooks; empty Agent catalog; disabled contribution; source-free
execution; private dependency isolation; explicit tool grants and rejection.

No commits, registry publication or remote delivery are authorized for this task.

## Implemented locally

- Generic directory surfaces are opaque optional boundaries in Engine. Nested
  pages and private manifests are handled only by the selected compiler.
- `packages/console-support` selects the embedded Console Shell and the
  `console/` convention. No Agent process or Agent URL is required.
- `packages/console-sdk` exposes page props, scoped navigation, shared React,
  Workspace Services types, and generated Contribution / Service contracts.
- `console/page.tsx` and nested static / `[parameter]/page.tsx` routes compile
  into one ordinary portable Contribution Plugin per directory. React comes
  from the Shell, including module-level context creation.
- The Agent repository owns `packages/agent-tool-convention`, with both
  `agent/tools.ts` declarations and `agent/tools.rs` native macros. Outputs use
  the existing Tool provider contract and consuming Agent authorization.

## Verification

The local Console fixture was built through `lenso app build`, started, and
exercised in a real browser: a stateful root page and `orders/42` route both
render. The Agent catalog is empty and Agent navigation is absent. A relocated
App distribution also starts with an empty PATH and serves embedded Shell and
Plan-bound contribution assets. Source files are not required by the packager's
runtime closure; this check did not delete the original checkout.

Both TypeScript and Rust Tool fixtures build and pass App startup / shutdown.
TypeScript `catalog` and `execute` were invoked through real `lenso plugin dev`;
`greet` returns `Hello, Ada!`. A Bun startup regression caused by nested Tokio
execution was fixed in Engine and has a real, dependency-installing regression
test. Disabled support yields no convention compilation; Engine tests also
cover private dependency isolation behind an owning Plugin boundary.

Focused frontend, service workspace, Engine workspace, contract, compiler,
typecheck, lint, and strict Rust Clippy checks were run. Existing ignored tests
remain opt-in; this is not a claim that every network/integration test ran.

## Current boundaries

These are local packages, not registry releases or published CLI aliases.
The precompiled Console development package now supports creation, development,
and building without a Rust toolchain or Console source checkout. Producers still
need Cargo and the Shell build. See [precompiled Host packaging](precompiled-console-host.md).
First-time npm dependency installation requires registry access.

Console now supports nested layout/loading/error boundaries, root not-found,
static/parameter/catch-all routes, strict page-source diagnostics, and optional
owner-scoped `console/services.ts` request adapters. See the public SDK README
for the exact semantics; this is not an implementation of every Next.js feature.
Existing Workspace Service admission and business Plugin authorization remain
in force. Tool authoring does not automatically start an Agent, select a model,
or grant tool execution.

## Completion evidence for remaining authoring work

- Compiled route tests cover static precedence, catch-all matching, emitted
  layouts and source type rejection. A real Chromium test covers loading,
  error recovery, layout composition and unmatched routes.
- The development-package gate now invokes a real owner service over HTTP:
  order 42 succeeds, order 99 is rejected. It runs with only package tools on
  PATH, then verifies disabled Console has zero active Plugin Instances.
- The Agent example `examples/app-tools/verify-agent.py` uses the real App Agent,
  fixture Model, Bun provider, immutable tool scope and persisted Session events.
  It proves catalog inclusion, actual execution, denial without execution and
  removal. No paid/live model or external message is involved.
- This uncovered two runtime prerequisites, now fixed locally: Agent's Bun
  Adapter needs the generation's admitted artifacts and V2 codecs; synchronous
  Bun startup RPC must not nest a temporary Tokio runtime inside the caller's
  runtime. The Adapter regression and eight V2 transport conformance tests pass.

Cross-platform status remains explicit: macOS ARM64 passed locally. The manual
`console-development-host.yml` matrix covers macOS and Linux and requires an
exact Engine commit. It has not been dispatched. Local Docker is unavailable,
so Linux execution is unverified. Windows is not a supported target of this
POSIX development package. Agent currently uses a local Cargo patch for the
Adapter fix; replace it with a reviewed released version during delivery.
