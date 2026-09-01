# ADR-0001: Compose Console from independent full Agent identities

Status: Proposed

## Context

Lenso Console serves any App built with the Lenso framework. Every Console
includes its own Console Agent so an operator can inspect and manage the current
App. An App built as an Agent also needs to expose its product Agent through the
same Console, producing an Agent Web experience alongside the ordinary Console
surfaces.

The current implementation models this case as two target modes: `console` for
the built-in Agent and `connected` for one separately running Agent Harness.
That exposes deployment topology as product identity and implies that the user
is switching between a local mode and a connected mode. It also fixes the
frontend contract to exactly two targets.

The Console Agent and an App Agent are both complete Agents. Each owns Sessions,
Profiles, Memory, Tasks, Trajectory, Tools, policy, and lifecycle state. A
Profile can change the composition of one Agent, but it cannot represent a
different Agent whose state and authority have another owner.

## Decision

Console presents a catalog of independent full Agent identities.

The Console Host always contributes exactly one Console Agent. The managed App
may contribute zero, one, or many App Agents. An ordinary Lenso App therefore
has only the Console Agent, while an Agent App has the Console Agent and its App
Agent or Agents.

Every catalog entry exposes the same Agent Web contract for bootstrap,
Sessions, Turns, Profiles, Models, Tools, Tasks, Trajectory, context sources,
and user interaction. An Agent identity has one stable key and independently
owns:

- its Agent Home and Plugin Root;
- its Session and Memory namespaces;
- its Profiles and active App Generations;
- its Tool catalog, Tool policy, and final authorization path; and
- its tasks, interactions, and lifecycle.

Console qualifies every routed operation with the owning Agent identity. Local
Session identifiers remain private to that Agent and cannot select or collide
with another Agent's state. Selecting a Session therefore selects its owning
Agent naturally; creating a Session requires one explicit Agent identity.

The Console UI presents Agent identities and their Sessions rather than
`Console Agent` and `Connected Harness` modes. The Console Agent remains a
normal, complete Agent in that information architecture. Its product
responsibility is to inspect and manage the current Lenso App through explicit
Capabilities supplied by the Console Host or the managed App.

Process placement and transport are Adapter facts. In-process, loopback,
connected, and future remote Agents may all satisfy the same Agent Web
contract. Those facts may appear in diagnostics but do not define the Agent's
user-facing identity or reduce its contract.

Profiles remain scoped to their owning Agent. A Profile transition may change
that Agent's selected Plugins, Tools, prompt, or policy through the ordinary
Generation Ready Gate. It cannot impersonate another Agent, transfer Sessions
or Memory, or expand authority beyond the owning Host Catalog.

The Console Agent and every App Agent retain separate authorization. Managing
another Agent or App requires an explicit Capability whose provider owns final
authorization. Neither catalog membership nor shared presentation grants
cross-Agent access.

## Consequences

- Console remains useful for every Lenso App without requiring the managed App
  to be an Agent.
- Agent Web becomes Console plus the Agent identities contributed by an Agent
  App, not a separate Console operating mode.
- The frontend and server must replace the closed `console | connected` target
  union with catalog-derived stable Agent identities.
- Session navigation and caches must include the Agent identity in their keys.
- Console Agent Sessions, Profiles, Memory, Tools, and policy remain complete
  and independent even when an App Agent is present.
- Hosts retain authority over Agent composition and control routes regardless
  of where an Agent runs.
- A transport failure makes only the affected Agent unavailable; it does not
  change another Agent's identity or state.

## Rejected alternatives

### Keep built-in and connected modes

This preserves the present implementation but makes deployment topology part
of the product model, caps Console at two Agents, and describes two complete
Agents as mutually exclusive modes.

### Represent stronger behavior as Console Agent Profiles

Profiles compose one Agent. They do not own an independent Agent Home,
Sessions, Memory, lifecycle, or authorization path, so using them as Agent
identities would merge facts with different owners.

### Select an App or Environment instead of an Agent

Console already serves the current Lenso App. App and environment selection do
not identify which complete Agent owns a Session or Turn and would obscure the
Agent Web product model.

### Reduce the Console Agent to a configuration assistant

The Console Agent requires the same durable conversation, Profile, Tool, task,
and inspection capabilities as other Agents. Giving it a smaller identity
contract would create a second Agent model and prevent normal Session-based
workflows.

## Acceptance

This ADR can become Accepted after one end-to-end tracer proves all of the
following:

1. An ordinary Lenso App exposes exactly the full Console Agent and can create,
   resume, and inspect its Sessions.
2. An Agent App exposes the Console Agent plus at least one full App Agent from
   a catalog rather than a hard-coded target union.
3. The Agents retain independent Session, Memory, Profile, Tool-policy, task,
   and trajectory state across restart.
4. Session navigation and query caches cannot read or mutate another Agent's
   state, including when local Session identifiers are equal.
5. Switching a Profile affects only the selected Agent through a Ready-Gated
   Generation transition.
6. Console Agent management actions cross an explicit Capability and cannot
   inherit or mutate an App Agent's control authority implicitly.
7. Removing every App Agent contribution leaves a valid Console with its full
   Console Agent; removing the Console Agent contribution fails the Console
   Host's required Agent slot deterministically.
8. In-process and loopback Agent Adapters pass the same Agent Web conformance
   fixture without exposing their placement as an Agent mode.

Until that proof exists, the current target switch remains shipped behavior and
this ADR records direction rather than delivered support.
