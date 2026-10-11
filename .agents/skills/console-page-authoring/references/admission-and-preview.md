# Admission and preview

## Choose preview authority explicitly

The [authoring guide's development section](../../../../packages/console-authoring/README.md)
owns the current flags and prerequisites. Two different modes exist:

- `--examples`: author-owned example transport, explicitly labelled and excluded
  from production output.
- `--backend`: an existing authenticated Console catalog and services; local
  replacement applies only to the matching admitted implementation.

They are mutually exclusive. A preview is not a business backend. Backend mode
retains real credential, Origin, CSRF, subject, and admission failures. Supply
credentials through the supported environment/operator workflow, not a committed
example file or synthetic permission response.

Backend preview needs a deployment whose trusted public origin is the browser
preview origin. The proxy preserves browser Origin, cookies and CSRF; an ordinary
backend configured only for a different production origin correctly rejects
unsafe requests, including read RPC POSTs. Configure an explicit same-public-origin
development deployment rather than weakening Origin checks or rewriting Origin.

Updated candidate preview and admission hosts render page commands and task
context through the shared interaction host. Check the installed host against
[runtime support](../../console-page-interactions/references/runtime-support.md);
older artifacts may still present selection only.

## Install exact output

Consult [the backend guide](../../../../packages/console/README.md) and
[public assembly types](../../../../packages/console/src/types.ts).
The generated plugin module supplies `plugin`, `manage`, `createMount`, and
`createInstallation`; prefer these factories for compiled owners.

For each installation, select its exact Plugin and Manage objects in the
application graph and Console target. Select exact finite operations and
separate read streams on mount services, then provide the built descriptor and
owned asset handler. A reconstructed object with the same ID is not the
installed instance. Independent installations share no mutable page/service
state.

Targets, tenants, trusted authentication, operation binding, Web/listener, and
Shell route handling belong to the application. `createConsolePlugin` joins
that graph; it does not start another application, listener, or Agent.

Mount IDs, workspace IDs, implementation identity, binding IDs, and activation
keys are not interchangeable. All selected browser mount paths must be globally
distinct and non-overlapping. Follow real catalog mount IDs for cross-workspace
navigation rather than building them from a label.

The [local TS assembly](../../../../examples/ts-console/host.ts) and
[existing-service mount](../../../../examples/ts-console/authorization-mount.ts)
demonstrate exact owner selection. They are scoped operator examples, not a
general authentication or session-administration implementation.

## Preserve authorization and write guarantees

Manage explicitly exposes selected existing methods; it neither implements the
business service nor grants permission. Request binding maps trusted evidence
into the domain owner's policy. A Console actor is not automatically an actor
for another business audience.

`management: true` enables the RPC entry. Writes default closed; `canWrite` is
an owner safety choice, not a substitute for confirmation, approval, idempotency,
or durable audit. A UI capability, administrator label, handoff payload, or
catalog key is not authorization.

Read streams use separate declarations, public item schemas, current scope
checks, and cancellation/cleanup. They do not inherit arbitrary finite-operation
write capabilities or promise replay/reconnect.

## Validation branch

Choose proofs for the changed boundary:

| Change | Evidence |
| --- | --- |
| Routes, typing, declarations | Public author `check` and `build` |
| Server client isolation | Compiler boundary tests / clean archive consumer |
| Mount assembly | Exact installed owner and requirements; wrong-owner rejection |
| Auth or binding | Allowed/denied/invalid requests; revocation across async gates |
| Writes | Actual owner confirmation and retry guarantees |
| Read streams | Current authorization, bounded projection, cancellation cleanup |
| UI | Real admitted/preview browser, not only local sample clients |

Package manifests and [CONTRIBUTING.md](../../../../CONTRIBUTING.md) own the
current repository commands. Inspect them instead of copying a release checklist
into an application. Publication, production recovery, and landing require their
own explicit authorization.
