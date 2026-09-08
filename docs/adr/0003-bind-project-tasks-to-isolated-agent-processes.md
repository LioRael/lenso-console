# ADR 0003: Bind project tasks to isolated Agent processes

Status: Accepted for implementation; not yet released.

## Decision

A local Console launcher may expose Projects underneath its App Agent identity.
Project is an explicit execution scope, not a Profile or another top-level Agent.
Every project has an immutable canonical directory and an independent Agent Home,
Session namespace, Plugin Root, configuration authority and runtime process.
Different projects may execute concurrently. No process changes cwd after startup.
The Console Agent has no project picker.

The Console Web Plugin owns the project registry and directory-selection UI. The
local launcher supplies process supervision. Neither concern changes portable
Kernel contracts. Connected Agents without local supervision remain read-only
with respect to working-directory selection.

Project-qualified task URLs and API paths carry both Agent and Project identity.
All operations, including cancel, interaction answers, rename, history and
coding configuration, retain that scope; changing the visible project never retargets an
in-flight request. Existing unqualified URLs keep the original App Agent and its
Home. Their bootstrap directory remains current-process context, not a claim
about historical Session provenance (Agent ADR 0102).

A new project starts from a bounded snapshot of the current visible Plugin Root,
Profiles and Tool policy, plus the bounded model catalog cache (which the Provider revalidates). It does not copy Sessions, Memory, checkpoints, runtime
ledgers, proposal history or credential files. Normal Auth provider configuration
continues to own credential resolution. Unsafe symlinks and configurations that
refer to the template's private Home are rejected rather than silently sharing
state. New projects have independent future configuration changes. Console reads the visible files twice and rejects detected changes; this is not a transaction across the source Agent configuration authority. Configure the source before opening a project. Standard coding Profiles are imported into the new SQLite authority before activation. Project readiness must succeed before its directory is published.

Registry writes are atomic. Canonical directories deduplicate symlink aliases.
A missing/moved directory fails closed on restart; a project ID is never rebound.
Only the local launcher can spawn processes; request bodies cannot supply binary,
Home, environment or arbitrary command arguments. Creation and directory browsing
require a same-origin custom header. Child data/control routes use private bearer
credentials, bounded bodies and the existing Agent proxy allowlist. Up to eight project processes are supported. Process count
is bounded, and launcher shutdown reaps all project children.

## First release

Provide recent projects plus an explicit absolute-directory picker, create/open a
project, and new/resumed project-qualified tasks. Preserve existing Agent identity
selection. No project deletion, directory relocation, shared task namespace,
shared mutable Agent Home or automatic process eviction is included.

## Validation

Automated checks cover directory seeding, registry routing, failed creation,
independent relay activity, disconnect continuation and duplicate-turn rejection.
The browser suite covers the project picker and scoped history. The opt-in real
process test uses `PROJECT_TEST_BINARY` and `PROJECT_TEST_TEMPLATE` with an existing
source Agent on port 8787; `PROJECT_TEST_TURNS=1` additionally calls the real model
to edit one fixture file per project and checks independent Session lists.

Turn relay activity lives in Console memory. Browser navigation does not cancel
supervised turns; returning to a project polls its durable Session and pending
questions. Console/launcher shutdown terminates running processes rather than
promising resumable in-flight execution. Terminal utility commands retain their
existing cancellation-on-view-exit behavior. Project deletion, lifecycle package
management and automatic process eviction are outside this first version.

Verified locally on 2026-09-08: two real Code Agents concurrently edited their own
`proof.txt`, with fixture-scoped approvals, disconnected browser responses and
independent Session inventories; project restart retained its directory. The
real model check took 56 seconds after fixing initial Profile import, startup
waiting and explicitly servicing Tool approvals.
