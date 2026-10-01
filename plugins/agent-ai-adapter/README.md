# Optional background completion adapter

`lenso.console.agent-ai-adapter` provides the existing
`lenso.ui.workspace-service@1` role with service `ai`, unary operations `complete` and explicit `recover`.
The body is `{ "model": "exact-model", "prompt": "text", "max_output": 64 }`.
Caller, user, project, credential, price and budget fields are forbidden. The
result contains text, a run reference, usage and exact Model binding evidence.
This path never opens a Session, Turn or Tool, and stores no prompt/answer history.

Installation and enablement are separate. Build the Console reference Host with
`--features agent-ai`, then explicitly select a Host-owned configuration file
through `LENSO_CONSOLE_AGENT_AI_CONFIG`. The Plugin is disableable in Plugin Root.
Defaults install/enable neither this provider nor any consumer grant. The
assistant UI and management MCP remain independently optional; this feature has
no browser dependency. No runtime hot installer is required.

Configuration contains `agent_origin` (loopback HTTP root), `ledger` (absolute
Plugin-owned SQLite file), `control_token_file` (the existing Host Agent control
credential), `issuer`, `public_key` (existing operators verification authority),
`provider_instance` (exact expected Model provider), and `profile`:

```json
{
  "callers": [{"consumer":"plugin-id/instance","user":"verified-subject","project":"host-project-id"}],
  "model": "exact-model",
  "price": {"version":"known-price-revision","input":1,"output":2},
  "budget":100000,
  "max_output":64,
  "concurrency":1
}
```

Prices are integer budget units per token, deliberately supplied by the
administrator for that exact provider/model. Unknown pricing cannot activate;
zero rates mean explicitly known free usage. Each bound adapter allows one
Host-selected project per caller/user. Use distinct bound instances/ledgers for
other purpose/project profiles. Configuring a profile does not issue an assertion.
Auth must explicitly grant both workspace `invoke` and Model `complete` audiences.
Kernel determines caller Instance; the immutable operators verifier determines
user. Request bodies cannot select or impersonate them. The adapter requires the
existing `lenso.auth.credential-state@1` binding. Its signed credential/session
references must still be active with the same subject, kind and both audiences.
Checks precede dispatch and settlement; pending work polls every 250 ms with a
2-second fail-closed inspection deadline. Revocation cancels remote work and
retains the full unknown charge.

The Agent Web Host enables the bridge with `--plugin-ai-authority ABSOLUTE_PATH`
and its **existing** `LENSO_AGENT_CONTROL_TOKEN`. That public authority file is
`{"realm":"operators","issuer":"existing-issuer","public_key":"existing-key"}`.
An embedding Host may set `AgentWebConfig.plugin_ai` and its existing authorized
control seam instead. No signing key is installed or created. The bridge remains
closed when authority/control is absent. Raw user assertions without Host control
authority cannot bypass Console admission. Redirects and retries are disabled.

Quote admission pins provider Instance, exact requested model, Generation and
the provider catalog's hard input ceiling. Reserve the full input ceiling plus
output limit before invocation; recheck Generation/ceiling before completing.
Missing ceilings/usage, tools, changed binding or excessive usage fail visibly.
The recorded price revision is Host pricing evidence, not a vendor billing
receipt. The existing Model wire contract cannot independently reveal a trusted
provider's internal model substitution; Host never falls back to another model.

SQLite schema version 1 uses WAL and FULL synchronization. Reservations and
run status/usage commit before completion; success settles actual usage.
Cancellation, transport failure and bad evidence retain the full reservation.
Restart preserves budget. Crashed `reserved` rows conservatively hold concurrency
until explicit evidence-backed recovery. Policy changes or foreign/incomplete databases
fail closed; there is no silent budget reset, migration or automatic refund.
`recover` accepts only `{ "run_id": "existing-uuid" }` under the same bound
consumer/user/project and live credential. It cancels active work and releases
concurrency only when the Agent retains a successful provider terminal receipt.
The row becomes `unknown` without any refund or replay. Receipt storage is bounded
and process-local: unknown IDs, failed/cancelled opens, lost receipts and Agent
restarts fail closed and still need operator reconciliation. A disappearing HTTP
worker cannot prove Kernel dispatch ended. This is conservative crash recovery
for Console interruption after provider success, not arbitrary crash recovery.
Automatic policy migration, multi-round Agent runs and explicit assistant
Session-write grants remain outside this slice.

Validation:

```sh
cargo test --offline --locked -p lenso-console-agent-ai-adapter
cargo clippy --offline --locked -p lenso-console-agent-ai-adapter --all-targets -- -D warnings
# Build the coordinated Agent Web test executable with cargo test --no-run.
LENSO_AI_AGENT_TEST_BINARY=/absolute/path/to/agent-test-executable \
  cargo test --offline --locked -p lenso-console-agent-ai-adapter native_binding_cross_process -- --ignored
```

The integration test uses actual Console Kernel binding and a separate Agent
fixture process, known synthetic pricing and no paid call. It rejects caller,
issuer/audience and project spoofing, verifies live revocation, cancel/failure reservations and evidence-backed crash recovery without refunds, and
asserts empty Agent Session lists before and after. Child process/listeners are
cleaned up. The Agent branch is `feat/plugin-ai-completion`, based on `74f9970`;
its existing history handlers and interactive run implementation are preserved.
