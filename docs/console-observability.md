# Console observability Plugin

Status: first-release design; implementation not yet shipped.

## Outcome

A developer can select one Managed App, find a recent HTTP request, open its
trace, understand where time or failure occurred, and inspect correlated logs.
The page states plainly when telemetry was sampled, dropped, late, or
unavailable. It never presents telemetry as configuration truth, audit evidence,
or proof that an operation completed.

The first release is a Console extension named **Observe**. Removing it removes
its Workspace, ingestion endpoint, queries, feed, retention jobs, and local
telemetry database. It does not change the observed App, Kernel, Web runtime, or
Console Shell.

One Observe Plugin instance owns one source App in the first release. Its
configuration fixes the Workspace subject, OTLP source identity, token resource,
listener, database, and retention. Supporting many Apps means selecting many
instances; a request never changes source because a UI selector changed.

## Owners and boundaries

| Concern | Owner | Removal boundary |
| --- | --- | --- |
| App signal production and propagation | the observed App's removable OTel Plugin | no OTel queue, propagation, or export remains in that App |
| OTLP ingestion, telemetry storage, retention, queries, and Observe UI | Console observability Plugin | no telemetry product behavior or data owner remains in Console |
| Workspace navigation, module loading, mount lifecycle, and browser transport | Console Shell/Host | no observability vocabulary or tables belong here |
| Current composition, Generation readiness, and activation state | target Host | telemetry cannot assert these facts |
| Business audit and durable operation history | the relevant domain Plugin | observability loss never destroys business truth |

The existing `lenso-otel-plugin` remains an exporter and propagation boundary.
It must not become the Console query database. The new Console observability
Plugin is a different product owner even when the reference App configures the
two together.

## First journey

1. The developer opens an App-scoped **Observe** Workspace.
2. The request list shows bounded recent server requests with method, route,
   status, start time, duration, and telemetry completeness.
3. Selecting a request opens a trace waterfall and span tree.
4. Selecting a span shows safe attributes, error details, downstream calls,
   and logs correlated by trace/span ID.
5. Runtime correlation displays telemetry-supplied App, Plugin instance, and
   Generation hints separately from an authoritative Host snapshot.
6. If the target runtime-inspection connection is unavailable, telemetry stays
   usable and the runtime panel says **Runtime state unavailable**. It never
   silently switches to another App.

The first useful success is one real request flowing from a sample Lenso Web
App through OTLP/HTTP into Observe and appearing without restarting Console.
The first honest failure is a rejected or dropped export reflected in ingestion
counters and the UI while the App request still succeeds.

## Telemetry input

### Protocol

The first receiver accepts OTLP/HTTP binary Protobuf on loopback-only endpoints:

- `POST /v1/traces`
- `POST /v1/logs`

Metrics are a compatible follow-up, not part of the request-investigation
tracer. OTLP success, partial-success, and retry responses follow the stable
[OTLP specification](https://opentelemetry.io/docs/specs/otlp/). The receiver
does not invent a Lenso transport for standard telemetry.

### App identity and admission

Each configured source has one immutable Console-local `source_id`, one display
label, and one secret bearer token. The endpoint derives source identity from
the admitted token; an exporter cannot select another `source_id` by supplying
an attribute. Tokens stay in Host-private resources and are never returned in
the Workspace catalog or Resolved App Plan.

The receiver defaults to loopback. A non-loopback listener requires a separate
deployment/authentication design and is rejected in the first release.

Admission is bounded:

- 4 MiB compressed request body and 16 MiB decoded-message limit;
- at most 10,000 spans or log records per request;
- a bounded decode/commit queue with explicit rejection when full;
- no synchronous callback into the observed App;
- retryable overload responses only before the receiver has accepted a batch;
- partial success reports exact rejected counts and a bounded reason.

These product limits are intentionally below OTLP's broad protocol ceiling.
They are configuration with reviewed maxima, not unbounded user input.

## Stored facts

The Plugin owns a SQLite database in WAL mode for the local first release. The
schema stores normalized resource, scope, span, event, link, and log facts plus
ingestion counters. Trace and span IDs remain fixed-width bytes; timestamps are
nanoseconds since Unix epoch at the storage boundary and strings in browser JSON
where JavaScript integer precision would be unsafe.

Every record retains:

- `source_id`, resource/service identity, instrumentation scope, and received time;
- trace/span identity, parent relationship, name, kind, start/end, status;
- a bounded attribute set after redaction;
- log severity, time, trace/span correlation, and bounded body;
- completeness flags for partial batches, late arrivals, and known loss.

The receiver does not store HTTP request/response bodies, authorization,
cookies, database statements, prompts, Tool arguments, Plugin configuration,
Actor assertions, or arbitrary binary attributes by default. Configuration may
add an attribute to an allowlist but cannot disable the hard secret-key denylist.
Values are length bounded and invalid UTF-8/binary values are represented as
redacted metadata rather than copied into the browser.

Resource attributes such as `service.name`, `service.version`, and
`deployment.environment.name`, plus stable HTTP server span attributes, retain
their OpenTelemetry meaning. Lenso correlation hints use a versioned namespace:

- `lenso.app.id`
- `lenso.plugin.instance`
- `lenso.runtime.generation`

They are observational labels. Only a separately authorized Host inspection
Capability can confirm current runtime state.

## Retention and loss

Defaults are seven days and 512 MiB, whichever boundary is reached first.
Cleanup runs in bounded batches and yields between transactions. Operators can
reduce either limit but cannot configure unlimited retention in the first
release. Removing the Plugin keeps or purges its database only through an
explicit removal choice; disablement never purges it.

The Plugin exposes counters for accepted/rejected records, decode failures,
queue saturation, redaction, retention deletion, and feed lag. Counter reset is
represented by a new receiver epoch. Missing sequence continuity is rendered as
**Telemetry may be incomplete**, never inferred as zero activity.

## Query contract

The observability domain owns a versioned request Capability. Its first
Operations are:

| Operation | Interaction | Required result |
| --- | --- | --- |
| `list_requests` | request/response | cursor-paginated recent HTTP server root spans for one `source_id` |
| `read_trace` | request/response | bounded trace tree, events, links, and completeness metadata |
| `list_trace_logs` | request/response | cursor-paginated logs for one trace and optional span |
| `watch_requests` | server stream | bounded incremental request summaries with lag/loss markers |
| `read_ingestion_health` | request/response | receiver epoch, accepted/rejected counters, queue and retention state |

Every request includes the immutable App subject supplied by the mount. The
provider validates it against its source catalog. Cursors are opaque, scoped to
source and query, and expire. Limits have protocol maxima. Unknown trace IDs
return not-found; a source mismatch returns denied/not-found without revealing
cross-App existence.

The stream has bounded per-subscriber capacity, explicit cancellation, and a
terminal lag marker rather than unbounded replay. The UI always recovers from a
fresh request-list snapshot after reconnecting.

The source schemas, generated Rust provider/client, TypeScript client, and
conformance fixtures must be authored together before the Capability is called
stable. Domain errors distinguish invalid query, not found, unavailable,
expired cursor, and resource exhausted from runtime transport failures.

## Workspace and browser transport prerequisite

Observe contributes an App-scoped `lenso.ui.contribution@1` Workspace containing
the request list, trace waterfall/tree, related logs, ingestion health, and a
runtime panel. Its service declaration names the observability query contract;
it does not contain a URL or bearer token.

The current Console release can mount the module but does not yet expose
Plugin-owned typed services to that module. Before Observe can ship, Console
must add a contract-aware browser transport that:

1. uses the mount's resolved owner and App subject rather than current UI selection;
2. admits only declared contract Operations and generated codecs;
3. binds server-side through the immutable Plan;
4. propagates cancellation and deadlines;
5. never accepts an arbitrary target URL, route suffix, or provider identity;
6. revokes dispatch when the mount or Generation is replaced.

This is a Console integration seam, not an observability-specific route and not
a universal JSON proxy. The observability implementation must not land a
temporary `/api/observability/*` branch in Console core to bypass it.

The exact first-release seam is specified in
[Workspace service transport](workspace-service-transport.md) and ADR-0008.

Authoritative runtime correlation additionally requires the deferred cross-App
inspection Connector. It is not required to ship trace/log investigation: the
runtime panel remains explicitly unavailable until that Capability is selected.

## First implementation slice

Concrete artifacts:

- `service/crates/lenso-capability-observability-query`: source schemas,
  generated Rust code, TypeScript projection, and conformance fixtures;
- `service/crates/lenso-console-observability-plugin`: OTLP receiver, SQLite
  store, retention, query provider, Workspace provider, and lifecycle;
- an independently built Observe frontend package with no Console-private imports;
- Console contract-aware Workspace service transport;
- a sample Lenso Web App configured with the removable OTel exporter;
- App/Console configuration fixtures with distinct installation targets.

Verification must prove real OTLP ingestion, pagination, late logs, partial
success, redaction, queue saturation without App failure, stream lag and
cancellation, App identity isolation, restart persistence, retention, Plugin
disable/remove behavior, and a browser deep-link reload. Deterministic fixtures
support these tests but do not replace the real Web request tracer.

## Deferred

- metrics dashboards, alerting, exemplars, tail sampling, and distributed collectors;
- non-loopback/multi-user deployment and shared retention;
- arbitrary attribute search or a general analytics language;
- restoration of Story as a universal event store;
- claims that telemetry proves configuration publication, audit, or business success.
