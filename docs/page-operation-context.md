# Page operation context

Console preserves operation `source`, `retry`, `cancellation`, `destructive`,
`outputDescription` and additive TS `outputSchema`/`outputSchemaAvailability`/
`errors` in catalogue metadata. Existing opaque keys and plugin/method invocation
identities remain unchanged. Old Manage versions explicitly report output/error
contracts unavailable. Convertible output schemas drop payload annotations such
as defaults/examples; declared errors are not inferred from thrown object codes.
Selection snapshots retain output validator identity and immutable error contracts.

Compiled pages use their existing transport:

```ts
const context = await page.services.inspect?.(
  "orders", { operation: "list", limit: 1 }, { signal: page.signal },
);
```

`workspace.inspect({mountId, service, operation?, offset?, limit?})` requires the
same owner/revision/implementation and optional expected-subject headers as
workspace invocation. It queries one admitted service, default 16/max 32 entries,
with a 256 KiB result budget. Offsets address declaration positions; authorization
can leave an empty page. Aliases resolve through frozen exact owner bindings.
Mount visibility, operation visibility, fresh identity and final disclosure checks
remain independent. No business handler runs. Source references are inert bounded
repository-relative paths, not URLs, absolute files or a source-file reader.
Responses omit raw URLs, request bodies, outputs, headers, credentials and thrown
messages. Static declarations and host associations remain unverified; catalogue
`available` is dispatch policy, not live health.

`WorkspaceOperationContext` from `@lenso/console-sdk/react` is an opt-in inline
reader within `WorkspaceScope`. It uses the same query, runs only on request and
retires late results. Its compact facts include source, independently measured
instances/generations and failure references. It reuses the existing Runtime
inspection rather than creating another Runtime page or schema editor.

## Explicit host-owned read adapters

`ConsoleOptions.operationInspection` accepts one installed
`Plugin<ConsoleOperationInspector>`. It receives the exact admitted operation,
mount/revision and verified request identity, never model-selected filesystem
scope. Its bounded result is attached per operation as `inspection`; top-level
availability says `operation-scoped`. Without an adapter, Runtime/history remain
explicitly unavailable. No empty-history success is fabricated.

`createConsoleRuntimeOperationInspector` from `@lenso/console-runtime/server`
requires the existing `createConsoleRuntimeInspection` plugin and explicit
bindings of target/mount/revision/service alias/owner plugin+method to Runtime
namespace/service/method/contract version (and inspection mount when needed).
It calls that plugin's existing authenticated `catalogue` and `status` methods;
its administrator and final-disclosure checks still apply. Output/error schemas
from the build manifest remain static/unverified. Runtime instance/generation and
state come only from current status; version mismatch closes the association.
An empty measured registration set is not ready. Runtime recent records lack
invocation-time generation, so this adapter does not infer historical joins.

`createConsoleDevOperationInspector` from `@lenso/console/dev-context` reads the
TS owner's existing generation-fenced provider. The trusted host injects a
`Plugin<ConsoleDevContextConnection>` whose `read` calls
`connectDev(FIXED_PRIVATE_DESCRIPTOR, action, options)` for inspect/recent only.
No collector, listener or arbitrary call entry is created. Bind exact Console
and dev operation identities explicitly. Administrator and target scope are
checked before/after reads. Reads are inspect -> recent(exact generation, exact
operation, limit16) -> inspect. Changed instance/generation/watch-input digest or
mismatched record provenance rejects disclosure. Each reference retains callRef,
operation, safe code/phase/effectState, time/duration, and the captured generation.
No output value or arbitrary diagnostic message is retained. TS instance and
Runtime instance are separate facts, never conflated by matching labels.

Dev output/error declarations and safe source are preserved alongside measured
execution identity. `codeRevision` is a pre-launch watched-input sample with
`verifiedLoadedBytes: false`, not a release SHA or loaded-byte attestation.
Only connected-development calls are covered. History is transient (64 records,
5 minutes), not durable or a complete HTTP/MCP history. Disconnected/unsupported
sources remain unavailable; no synthetic success or automatic retry is added.

`combineConsoleOperationInspectors` composes at most four independently authorized
adapters without caching identities. Conflicting measured providers fail closed.
Ordinary installs keep published dependencies. Local review can consume the TS
owner's complete candidate archive resolution fragment in an isolated application;
do not copy private archive paths into production manifests or patch node_modules.

## Agent registration and proof boundaries

`createConsoleOperationContextTools` and `registerConsoleOperationContext` from
`@lenso/agent-console/context-tools` adapt the existing Agent ToolSource and profile
context interface. The host supplies the current page from verified Agent
identity/project admission. Model input selects only an admitted service/operation
and bounded pagination. Catalog/prepare do not fetch a global catalogue. Invoke
uses the page's existing Console transport, checks a hashed scope/page/revision
precondition and rechecks admission after reading. Existing tool identities and
profile context remain. Registration is explicit code/configuration; this change
does not alter a running Agent installation, provider or production grants.

The targeted native proof uses an isolated prepared Runtime kernel and the TS
owner's local archive set with its native supervisor. A real output-validation
failure is retained by that provider. The Console HTTP adapter, Agent tool and
headless page read the same safe source, failure reference, generation and declared
contracts. It also checks project retirement and denied administrator access.
No paid model is called. Native proof is opt-in via `LENSO_CONTEXT_NATIVE=1` (or the
existing required-Runtime gate); add `LENSO_CONTEXT_TS_ROOT`/`LENSO_CONTEXT_TS_NATIVE`
for the installed local TS candidate and `LENSO_CONTEXT_BROWSER=1` for headless UI.
The host's private descriptor, remote authenticated deployment and production
profile installation remain application-owned and are not performed here.

## Runtime read authentication

`createConsoleRuntimeInspection({readScope: true, ...})` is an explicit host opt-in
for finite status/catalogue reads. It requires the existing Auth beginRead,
enforceRead, scope-aware sessionRead, finishRead and closeRead interfaces. The host's
sessionRead must record its administrator policy in the supplied scope so that
finishRead replays it before disclosure. Missing interfaces retain the legacy
path; the greeting trial is unchanged. Each read gets an independent request
lifetime, rechecks administrator access, finishes before returning projected data,
checks the finished identity/scope and closes in finally. No identity or permission
is cached between requests.

The isolated local source measured eight identity verifications for a legacy
status read and two with scope opt-in; grants, identity and administrator
revocation after the read still reject disclosure. On the complete native test's
single HTTP context query, the measured count was 29 versus 17, with single local
samples of 19.97 ms versus 15.76 ms; later samples vary (including slower scoped
in-memory status checks). The stable result is fewer identity-source calls, not
a proven latency reduction. These are functional/local observations, not
database or network benchmarks or a stable performance claim.
