# Page operation context

Console preserves the installed Manage operation's `source`, `retry`,
`cancellation`, `destructive` and `outputDescription` in optional catalogue
`metadata`. Existing opaque keys and `targetId`/`pluginId`/`method` invocation
identities remain unchanged. Catalogue `available` describes configured dispatch
policy, not live service readiness.

For a compiled page, use its existing scoped service transport:

```ts
const context = await page.services.inspect?.(
  "orders",
  { operation: "read", limit: 1 },
  { signal: page.signal },
);
```

`inspect` is optional for older Hosts. The underlying RPC is
`workspace.inspect({mountId, service, operation?, offset?, limit?})` on the
existing Console v2 transport. It requires the same owner, revision and
implementation headers as workspace invocation, and the expected subject when
supplied. It returns one admitted mount/service only, at most 32 operation
references (default 16). Offsets address declaration positions; filtering can
produce empty pages. Clients must not interpret an empty page as a successful
invocation or infer readiness from declarations. No operation input/output validation, service
handler or Runtime call runs during this query.

Page references include target, mount, revision, implementation and the explicitly
admitted owner instance. Service aliases resolve through the frozen mount binding,
so two `read` aliases can refer to different owner methods. Mount access and
operation visibility are checked independently. Identity and permission are
checked again before disclosure; stale revisions, revoked identities and denied
operations cannot supply context. The result is redacted by the existing Engine
secret filter. It contains no URL parameters, business input, results, thrown
messages or arbitrary exception details. Source references permit only inert
repository-relative file names and optional export/line/column; absolute paths,
URLs and parent traversal are omitted. There is no source-file reader.

`WorkspaceOperationContext` from `@lenso/console-sdk/react` is an opt-in inline
reader within the existing `WorkspaceScope`. It performs no query until requested,
uses Lenso UI Button and semantic definition lists, and retires pending results
with the page lifetime. It does not install a page, global directory, Agent
connection or tool. A trusted Agent integration can read the same
`services.inspect` result on demand, within its existing project/session scope;
there is no second Agent fact store and no automatic prompt injection or paid call.

## Explicit gaps and upstream integration

The response is `provenance: admitted-declaration`, `availability: unverified`.
The currently installed published Engine 0.6 Operation has output descriptions
but no output schema or declared business-error contract. Both `outputContract`
and `errorContract` therefore say `unavailable`; an input schema or observed
result is never substituted for either. No dependency override or sibling source
is used. When the TS owner's compatible published Engine/Manage contract is
available, project its `outputSchema`, `outputSchemaAvailability` and declared
`errors` through the owner's safe projection, with bounded schemas and no error
payloads. Recheck selection identity/snapshotting for `output` and `errors` then.

Existing `@lenso/console-runtime` inspection already distinguishes measured
`status` (service instance/generation) from an `unverified` static catalogue
(input/output/error contracts). It is not a trustworthy automatic join to a
Console owner operation: a host must explicitly bind target + exact owner
operation + revision to Runtime namespace/service/method and expected contract
version. No binding is configured here, so `runtime` is explicitly
`unavailable: runtime-binding-not-configured`.

No dev collector is connected. `recentFailures` is explicitly
`unavailable: collector-not-configured`, not an empty history. The TS/CLI owner
must supply a bounded, authenticated read with stable call reference, operation
identity, instance/generation, source/build revision, time/duration, safe outcome,
error code and conservative effect state. Generation must be captured at call
time; current registrations cannot establish a historical generation. Queries
must enforce scope, generation and a limit without returning input/output,
exception messages, headers or credentials. Runtime's existing recent records
lack instance/generation, so matching method names alone is insufficient. A
future bridge must preserve Runtime/collector final authorization and disclosure
checks. This candidate does not claim that bridge or an Agent tool is installed.
