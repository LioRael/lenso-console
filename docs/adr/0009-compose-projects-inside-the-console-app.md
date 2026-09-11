# ADR-0009: Compose Projects inside the Console App

Status: Accepted direction; migration in progress.

## Context

The first Projects Workspace contributes native UI but its owner service keeps
one process-wide delegated credential and forwards operations to a separately
started business App. That is an external-App connection, not the intended
built-in Projects deployment. Reusing that connection for a team Console would
also mix user identities. A UI mount alone does not establish an authentication
boundary.

## Decision

Compose Console, Auth, Organization, Projects and Projects Web as linked Plugins
in one Console App Generation. Lenso Web owns the shared HTTP listener. Projects
owns records, storage migrations and business authorization. Projects Web owns
business page composition and its adapter. Console owns the shell and shared
session entry point. Plugin removal removes its contribution and bindings.

Console login establishes the user session once. Ingress selects credentials;
Auth authenticates them and issues a bounded actor assertion. Preserve that
request's InvocationContext through Console's HTTP adapter, the Workspace
queue and each bound capability call, including streams. Never substitute a
process-global user or accept actor identity from browser JSON/headers.
Projects checks the actor and organization membership on every operation.
Agent execution must be bound to the initiating user's scoped authorization,
not a shared Console control token or another user's business grant.

External-App connections remain explicitly external. A target origin and
business-consent flow must not be prerequisites for built-in Projects. The
55440 acceptance App is an external integration fixture, not a deployment
service required by Console.

## Migration and evidence

- Preserve incoming invocation context through HTTP and Workspace dispatch.
- Add the shared Console session boundary using the existing Auth contracts;
  fail closed when team authentication is configured but unavailable.
- Compose business providers with explicit secret references and Plugin-owned
  storage. Do not copy fixture accounts, signing keys or elevated actors.
- Replace the built-in Workspace's remote grant with bound business operations
  and remove its second login UI.
- Bind Agent turns to the same initiating identity, including revoke/logout.
- Verify a single listener/process without the external fixture, two-user and
  cross-organization isolation, cancellation, restart persistence and removal.

The context transport and Console session boundary are implemented. Browser login
methods are owned by Auth Plugins and discovered from their bound dependencies.
Console authenticates each protected request and accepts explicitly configured
administrator subjects. Ordinary business-user access, the native Projects
adapter, and user-scoped Agent execution remain migration work; the existing
external Projects fixture must not be presented as same-process completion.

## Consequences

Same-process composition does not remove business permission checks, nor does
it imply that PostgreSQL itself runs inside Console. The local launcher remains
loopback-only until a separately verified shared authentication boundary covers
all remotely exposed Console operations. Host-authenticated users and Agent
provider logins are distinct identities.
