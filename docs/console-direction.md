# Console product direction

Status: Agreed product direction, not a description of shipped functionality.
This document records scope and design questions; it is not an implementation
PRD or delivery commitment. Execution issues and PRDs belong in the
[central tracker](agents/issue-tracker.md).

## Outcome

Console is the extensible administration and development workbench for Lenso
Apps. A team can administer its application's business functions, understand its
runtime behavior, and add tools that support its work without those tools
becoming hardcoded Console features.

Console is an application backend UI, not merely an infrastructure dashboard or
an Agent chat surface. User management, orders, content moderation, and other
application-specific administration are first-class uses. Their business rules
and data remain owned by the corresponding App Plugins.

The domain vocabulary lives in [CONTEXT.md](../CONTEXT.md). The native extension
decision lives in [ADR-0004](adr/0004-prefer-native-console-page-contributions.md).

## Product boundaries

| Owner | Responsibility |
| --- | --- |
| Console Shell and extension mechanism | Work context, navigation, contribution lifecycle, compatibility, and common integration contracts |
| App business Plugin | Business data, rules, final authorization, and its administration experience |
| Console tool Plugin | Its workspace, business data, background behavior, and retention policy |
| Managed App Host | Authoritative configuration and runtime state, activation, and explicitly exposed management access |
| Agent | Conversations, tasks, execution, tools, and Agent interaction |

An App administration page and a Console tool workspace use the same contribution
mechanism, but do not have the same ownership or lifecycle:

- App administration actions retain their selected App identity, including
  during navigation or target changes.
- A team's project-management data must not disappear because a development App
  restarts or becomes unavailable.
- App Plugins, Console extensions, and Management Agent Plugins remain explicit
  installation targets. A product may supply companion Plugins, but installation
  or authority must not silently cross targets.
- Removing a tool removes its active UI and behavior without breaking Console.
  Persistent data follows an explicit retention/removal policy.
- Business pages call their owner's APIs or Capabilities; Console is not a
  universal database editor that bypasses domain rules.

Both a dedicated App backend and an independently deployed team workbench are
product use cases. Their packaging, identity, deployment, and shared-state
requirements remain to be designed. Dynamic pages alone do not provide
multi-user collaboration or permission isolation.

## Mainline 1: Observe the App under development

Build a first-party observability Plugin rather than restoring the retired Story
system or embedding every observability concern in Console core.

For a Web backend, the primary journey is:

1. Find a request of interest.
2. Inspect its trace, timing breakdown, downstream calls, errors, and logs.
3. Relate the evidence to the appropriate App, Plugin instance, and runtime
   generation where the source supplies that context.
4. Inspect authoritative runtime state and relevant changes to understand why
   the application behaves this way.

OpenTelemetry is the recommended telemetry foundation, not a selected storage or
query backend. Keep two distinct sources of truth:

- Telemetry describes observed activity and may be sampled, delayed, or lost.
- Host-owned state describes configuration, activation, and readiness. Durable
  operation history and business audit remain with their respective owners.

A timeline may correlate these facts without introducing another universal
event store. Missing telemetry is not evidence that an operation never happened;
an activation log is not proof that a configuration became active.

Detailed design must choose ingestion, query, storage, retention, correlation,
and local setup behavior. It must include bounded collection, visible sampling
and loss, and sensitive-data handling. A slow or disconnected observer must not
block App behavior. Large-scale analytics and alerting are not prerequisites for
the first useful request investigation.

## Mainline 2: Native Plugin pages and workspaces

Plugins must be able to supply complete business interfaces: navigation, nested
pages, tables, editors, boards, charts, and application-specific interactions.
Schema-generated forms and external embeds are useful options, not the ceiling.

The primary mode is a native frontend module integrated with Console's routing,
theme, and context. An iframe is an optional external-page integration mode, not
the default Plugin model. See ADR-0004 for the trust trade-off.

For Console-scoped contributions, the product object exposed in the primary
rail is a **Workspace**. Each Plugin-contributed Workspace is a direct primary
rail item and owns the contextual navigation shown in the second sidebar. There
is no generic Tools page between the operator and a Workspace; Tool remains the
name of an executable capability, not a navigation container.

Standardize the seams, not every internal implementation:

- Identity, compatibility, route ownership, and navigation contributions.
- App/workspace context and supported backend access.
- Contribution activation, deactivation, upgrade, and cleanup.
- Optional common integrations such as commands and object deep links.

Plugins retain freedom over internal component trees, state, layouts, and
specialized dependencies. Official components and templates accelerate
development without being mandatory rendering primitives.

The goal is installation without changing or recompiling Console source.
Runtime loading, shared dependencies, styles, SDK versioning, and deployment
behavior need a concrete design. Dynamic contribution discovery does not imply
universal hot-loading of backend implementations or permission to execute any
code advertised by a connected App.

Cross-tool workflows should connect owned objects, not merge their databases.
For example, an observation may lead to an Issue and an Agent handoff through
explicit actions and links. The observation, Issue, and Agent Task retain their
own owners and authorization.

## Mainline 3: Plugin discovery and distribution

Bring the marketplace into this design cycle rather than treating it as distant
polish. The recommended model is an official discovery/trust directory with open
source and artifact origins, not an exclusive central hosting requirement.

Keep three concerns separate:

| Concern | Recommended direction |
| --- | --- |
| Source development | GitHub-friendly, without excluding other Git hosts or private repositories |
| Artifact distribution | Approved origins and immutable artifact references with integrity verification |
| Official marketplace | Discovery, publisher identity, compatibility, permissions, provenance, and risk information |

The first marketplace journey should cover finding a Plugin, understanding its
installation target and requirements, reviewing a version, installing it, and
seeing the result. Private catalogs and explicitly permitted direct installation
should fit the model. Existing installations must not require the directory to
remain online to run.

Listing, publisher verification, and security review are different claims.
Neither listing nor installation grants business authority or implies that a
Host can execute an implementation. Mutable repository branches/tags alone are
not sufficient installed-artifact identity.

Namespace governance, metadata contracts, distribution transports, provenance,
revocation/update policy, and private catalog behavior remain design questions.
Ratings, rankings, payments, and recommendations are not first-slice requirements.
This direction does not create a central release runtime or change the
[approved release process](release-process.md).

## Proposed delivery sequence

The sequence below is a planning recommendation, not a claim of completed work.

1. **Extension foundation with two real contributions.** Use observability and
   one App business page, such as user management, to validate both diagnostic
   and transactional UI. Define marketplace identity and artifact needs alongside
   this work, before freezing the extension packaging contract.
2. **Discovery to installed workspace.** Exercise directory discovery,
   compatibility and installation review, activation, and removal of a
   contribution without editing Console source.
3. **Independent tool and cross-tool workflow.** Build a minimal project-management
   Plugin that does not require project-management code in Console core. Connect
   an observation to an Issue and an Agent handoff, with explicit ownership.
4. **Shared team operation.** Design identity, membership, permissions, durable
   shared workspaces, and deployment from concrete collaboration requirements.

Proof must include honest failures: an unavailable App, denied business action,
incompatible extension, failed activation, and incomplete telemetry must not
silently target another App or masquerade as success.

## Relationship to existing work

- Agent execution and Agent UI improvements continue as a separate workstream.
  This direction does not redesign those contracts.
- [ADR-0002](adr/0002-separate-app-plugin-management-from-agent-interaction.md)
  remains authoritative for separate App and Agent catalogs and management
  authority. The contribution model extends it; it does not merge those scopes.
- The Agent Project in
  [ADR-0003](adr/0003-bind-project-tasks-to-isolated-agent-processes.md) is a
  directory-bound execution scope, not the future project-management Plugin's
  project object.
- Native Workspace contributions and owner-service dispatch now ship as the
  Console foundation. A marketplace and observability backend do not yet ship.
- Retired Story, dynamic Module composition, and release machinery are not
  restored by this document. New mechanisms require reviewed designs.

## Implementation specifications

The first-release implementation boundaries are:

1. The native contribution contract, loader/lifecycle, dependency compatibility,
   and target-bound backend integration. The
   [page contribution design](console-page-contributions.md) records the interface,
   lifecycle, implementation choices, and validation gates. The
   [Workspace service transport](workspace-service-transport.md) and ADR-0008
   specify Plan-bound backend dispatch.
2. The observability journey, telemetry/runtime correlation, and ingestion/query
   backend choices are specified in
   [Console observability Plugin](console-observability.md) and ADR-0006.
3. The marketplace identity, installation-target, artifact, and update contracts
   are specified in [Console Plugin marketplace](plugin-marketplace.md) and
   ADR-0007.

Each design must name fact owners, necessary cross-Plugin Capability contracts,
success and failure behavior, and a real first-slice proof. Do not invent generic
framework contracts or authorize publication solely from this product direction.

## References

- [OpenTelemetry scope and responsibilities](https://opentelemetry.io/docs/what-is-opentelemetry/)
- [Go module distribution and integrity model](https://go.dev/ref/mod)
