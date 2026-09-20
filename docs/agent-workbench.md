# Agent project workbench

The conversation page displays the selected Agent's current working directory
when its bootstrap response includes `workspace.path`. New and resumed tasks
remain on Agent-qualified routes. The existing Agent picker selects a connected
Agent; it does not change a running process's directory or bind older Sessions to
that directory. Agents without workspace metadata retain the existing interface.

The Changes tab displays successful `git_diff` and `checkpoint_review` results
recorded in the current task. It identifies truncated output, retains earlier
snapshots, and renders output as text. These snapshots may be stale. “Ask for a
fresh diff” prepares a message for the user to submit through the existing Tool
policy; it does not query or modify the filesystem directly.

The optional bootstrap contract is defined in Agent ADR-0102. Install Agent v0.1.7 or newer to enable directory context; Agent v0.1.6 does not
include the field. Changes remains available for existing recorded Tool results.

## Execution-state conformance

Console presents execution state as evidence from its owner, rather than
turning a browser transport result into an Agent or App result.

- A dropped browser Turn stream is shown as one of **UI disconnected · Agent
  still running**, **UI disconnected · Agent failed**, or **UI disconnected ·
  Agent state unknown** only when the relay has a matching request observation.
  The relay's `terminalOutcome` is distinct from free-form `detail`. A missing
  terminal outcome, including a detail such as `done`, is not an Agent failure.
- Relay activity is transient Console memory. The durable Agent Session remains
  the canonical record of the Turn. A browser disconnect therefore causes a
  Session refresh when possible; it does not start a queued or newly submitted
  follow-up Turn while the preceding result is unknown.
- A detached terminal-command stream is **Result uncertain**. Where a durable
  side effect may have happened, Console explicitly says so and never replaces
  that uncertainty with “nothing happened.”
- Plugin configuration evidence keeps three different facts visible when the
  matched candidate fails readiness: **Configuration saved**, **New Generation
  failed readiness**, and **Current Generation unchanged**. The last statement
  is rendered only when inventory evidence identifies a non-candidate active
  Generation. A Host operation timeout is **Result uncertain**, not an ordinary
  failure or a routing-success claim.
- A ready configuration approval is revision-fenced. If it reviewed revision
  X and the current management revision is Y, Console shows **Approval must be
  refreshed** with both revisions and does not reuse it for publication.
- Trajectory filtering groups only matching records, so a search cannot leave
  empty Turn headers. Its inspector identifies the selected Agent evidence
  owner, Session, trajectory revision, and source event IDs.

These states qualify only Console's local projection and its supplied Host or
Agent evidence. They do not certify an external platform action, an App business
authorization, or an external system's final state.
