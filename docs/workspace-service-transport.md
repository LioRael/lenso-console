# Workspace service transport

Status: owner-service first slice implemented; subject services and Observe remain follow-ups.

## Outcome

A native Workspace module can call only the backend Operations declared by its
admitted contribution. Console derives the destination from the immutable mount
and Resolved App Plan. Browser code cannot choose a provider, Host, URL, token,
or arbitrary Console route.

This seam lets Observe remain a removable Plugin instead of adding
observability-specific HTTP handlers to Console core.

## Two contract layers

The domain Capability remains the public business contract. For example,
`lenso.observability.query@1` defines request, trace, log, and feed semantics.
Its generated TypeScript client is what the Workspace author uses.

`lenso.ui.workspace-service@1` is a Console integration Capability. A Plugin
that exposes domain Operations to its Workspace provides this adapter alongside
`lenso.ui.contribution@1`. The adapter dispatches only its declared service IDs
and uses the domain's generated codecs internally. Console treats the encoded
body as bounded opaque bytes; it does not interpret observability, users,
projects, or other business schemas.

This is not a universal HTTP proxy:

- the provider is Plan-bound and matched to the contribution owner;
- service ID, contract, descriptor version, and Operation allowlist are frozen
  in the activation catalog;
- there is no URL, method, header, credential, or provider field from the browser;
- the adapter performs domain decoding and final authorization;
- revocation follows the owning Plugin Generation.

## Contribution contract 1.2

Each service requirement has:

| Field | Meaning |
| --- | --- |
| `service_id` | mount-local stable slug used by generated browser clients |
| `capability_id` | domain Capability identity |
| `descriptor_version` | exact supported domain descriptor |
| `operations` | non-empty allowlist used by this Workspace release |
| `source` | `owner` in the first release; `subject` is reserved for a connected target |
| `required` | whether absence makes the mount unavailable |

Descriptor 1.2 requires these fields. A 1.1 provider remains valid only under a
1.1 Console binding and has no executable services. Console does not infer a
service source from a URL or the currently selected App.

At activation Console calls each contribution and workspace-service provider
once, indexes both by provider instance identity, validates declarations against
exports, and publishes one atomic mount catalog. Duplicate service IDs,
undeclared Operations, version mismatch, ambiguous providers, or a missing
required owner service fail admission before browser code executes.

The first release supports `source: owner`. `source: subject` requires the
cross-App Connector and remains unavailable with an explicit reason until a
target Host exports the exact service.

## Integration Capability

The source contract for `lenso.ui.workspace-service@1` defines:

| Operation | Interaction | Semantics |
| --- | --- | --- |
| `describe_exports` | request/response | immutable service IDs, domain contract/version, Operation kinds, and adapter revision |
| `invoke` | request/response | one bounded encoded domain request and one encoded success/domain-error result |
| `subscribe` | server stream | one bounded encoded request followed by encoded items and one terminal outcome |

`invoke` and `subscribe` requests contain service ID, Operation, codec media
type, and encoded body only. They do not contain owner/provider identity because
the generated handle already names the Plan binding. The provider rejects any
declaration drift even if Console validation has a defect.

First-release maxima are 1 MiB request, 4 MiB unary response, 1 MiB stream item,
32 services per contribution, and 32 Operations per service. Domain contracts
may impose smaller limits. Deadlines and cancellation use ordinary Kernel
Invocation Context; a timed-out browser request does not claim that a mutation
was rolled back.

The integration domain errors are unknown service, unknown Operation, codec
mismatch, request too large, response too large, denied, and resource exhausted.
Domain errors remain inside the encoded domain result and are decoded by the
generated domain client. Runtime unavailable, deadline, cancellation, and
Generation replacement remain transport failures.

## Same-origin browser API

Console exposes mount-scoped endpoints:

- `POST /api/console/v1/pages/{mount}/services/{service}/invoke/{operation}`
- `POST /api/console/v1/pages/{mount}/services/{service}/subscribe/{operation}`

The server resolves `{mount}` from its admitted catalog and `{service}` plus
`{operation}` from the frozen declaration. It never reads a target from query,
body, Origin, referrer, local storage, or the current App selector. Requests for
an App-scoped mount additionally retain the canonical App identity embedded in
that mount.

Unary bodies and results use the media type declared by generated codecs. The
first browser projection uses JSON with wide integers encoded as decimal
strings. Streaming uses same-origin SSE with base64url-encoded bounded items and
explicit sequence/terminal records; disconnect cancels the Kernel invocation.
A reconnect starts from a fresh domain snapshot unless that domain contract
defines a cursor. Console does not add replay.

The Workspace runtime supplies a client factory scoped to the current mount.
It does not expose raw endpoint construction. A generated client names one
`service_id`, validates the catalog contract/version, encodes requests, and
decodes success/domain errors. Navigation unmount aborts outstanding calls and
streams.

## Lifecycle and failure

| Event | Result |
| --- | --- |
| required service missing at activation | mount is unavailable; module is not imported |
| optional service missing | catalog reports absence; client creation returns unavailable |
| provider Generation replaced | old dispatch closes before the new mount revision is published |
| browser leaves mount | requests/streams are cancelled; backend mutations may still have unknown outcome |
| provider fails | only its mounts/services become unavailable |
| Shell reload | clients are recreated from a fresh catalog snapshot |
| stale asset with revoked service | asset may render an unavailable page but cannot dispatch |

The browser receives bounded problem details without Plugin configuration,
tokens, internal paths, provider topology, or cross-App existence leakage.

## Implemented first slice

The repository now includes descriptor 1.2 of `lenso.ui.contribution`, the
generated Rust and TypeScript projections for `lenso.ui.workspace-service@1`,
and a `many` service Port on `lenso.console.web`. Activation pairs contribution
and service providers by exact provider-instance identity, validates exports,
and freezes mount-scoped routes before the HTTP server starts.

The Shell supplies a mount-scoped client with unary and SSE support. Its request
signal is the Workspace mount signal, and dropping an SSE response cancels the
Kernel Stream. The Welcome Plugin is the reference owner provider; product tests
start the real resolved graph and invoke both request and stream Operations.
Focused tests cover missing required services, descriptor drift, unavailable
optional subject services, undeclared routes, malformed responses, body limits,
and browser cancellation.

The next consumer is Observe. No observability-specific Console route is
accepted as substitute proof. `source: subject` remains unavailable until the
cross-App Connector supplies an exact Plan-bound export.

Publication beyond this repository-local integration contract still waits for
App-switch isolation, back/forward/reload coverage, and the first real domain
Capability consumer. The mount-keyed route tests already cover identical
service IDs across multiple mounts.
