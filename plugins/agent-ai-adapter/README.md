# Optional AI adapter

`lenso.console.agent-ai-adapter` provides the existing
`lenso.ui.workspace-service@1` role with service `ai`, unary operations `complete`, `run` and explicit `recover`, plus Session authority operations.
The body is `{ "model": "exact-model", "prompt": "text", "max_output": 64 }`.
Caller, user, project, credential, price and budget fields are forbidden. The
result contains text, a run reference, usage and exact Model binding evidence.
The `complete` path never opens a Session, Turn or Tool, and stores no prompt/answer history.

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
Restart preserves both budget and pending execution slots. `reserved` and
`unknown` rows conservatively hold concurrency until explicit evidence-backed
recovery; Drop, cancel HTTP success, timeout and disconnect cannot release it. Policy changes or foreign/incomplete databases
fail closed; there is no silent budget reset, migration or automatic refund.
`recover` accepts only `{ "run_id": "existing-uuid" }` under the same bound
consumer/user/project and live credential. It cancels active work and releases
concurrency only when the Agent retains a successful provider terminal receipt.
The row becomes `settled_unknown`: execution is settled but unknown usage retains
the full charge, without refund or replay. The API reports cost `state: unknown`
and `execution: settled`. Old unknown rows also hold concurrency; no implicit
migration clears them. Receipt storage is bounded
and process-local: unknown IDs, failed/cancelled opens, lost receipts and Agent
restarts fail closed and still need operator reconciliation. A disappearing HTTP
worker cannot prove Kernel dispatch ended. This is conservative crash recovery
for Console interruption after provider success, not arbitrary crash recovery.
Automatic policy migration remains unsupported. The optional `run` path below reuses the existing Agent Loop with bounded calls and scoped Session authority.

## Bounded Agent tasks and explicit history

Omit `run` from configuration to keep completion-only operation. To opt in, add:

```json
{
  "run": {
    "authority": "/absolute/plugin-owned/run-authority.sqlite",
    "workspace": "/absolute/host-selected/project",
    "max_calls": 2,
    "tools": ["uppercase"],
    "existing_session_owners": ["trusted-assistant-consumer/default"]
  }
}
```

The separate authority file stores immutable policy, Session scope references and
revocable grants, never text. It must differ from the usage ledger. Multiple
configured callers/projects share the same immutable purpose profile; per-request
caller/user/project always comes from Kernel, operators Actor and Host policy.

`run` accepts `{ "model":"exact-model", "prompt":"text", "max_output":64,
"max_calls":2, "session_id":null, "grant_id":null }`. Calls must fit the admin
ceiling (1–16). The full quoted input ceiling and output limit for **all** possible
calls are durably reserved before dispatch. Each actual native Model open, including
Loop retries, consumes the bound; successful terminal usage settles aggregate cost.
Missing/excessive usage or cancellation retains the entire reservation. No hidden
retry, model substitution or price fallback is introduced. Result evidence includes
exact binding, actual calls and optional Session ID.

With no Session ID, the existing Loop uses bounded transient task history, discarded
after task Kernel shutdown. No assistant history is created. Memory persistence,
Artifacts, compaction, attachments and nested Agent/code execution Tools are denied
in this bounded composition. Existing Tool Hooks and provider checks still apply;
only explicitly allowed Tools appear. Full/Assisted approval is not inherited and
absence of interactive approval fails closed. Custom trusted Tools must not perform
unmetered secondary Model calls. The Host workspace is explicit; there is no sandbox
or additional Tool authority implied by this native task boundary.

Persistent history requires an explicit operation:

- `open_session` with `{}` creates a plugin/user/project-scoped Session.
- `register_session` with `{ "session_id":"existing-id" }` verifies an existing
  assistant Session's signed owner before binding it. Only admin-designated
  `existing_session_owners` may register it.
- `grant_session` with `{ "session_id":"id", "consumer":"recipient/instance",
  "seconds":300 }` is an explicit privileged owner action. It grants just this
  Session to a configured consumer with the same verified user and project, for
  at most one hour. The grant does not enable Tools or change model policy.
- `revoke_grant` with `{ "grant_id":"id" }` revokes only the owner's grant.

Runs can resume owned scoped Sessions directly; another consumer must include the
exact explicit grant. They cannot create history implicitly or supply a namespace,
project, user, credential, workspace or Tool list. Authenticated SQLite namespaces
keep plugin history outside root assistant listings; existing assistant ownership
remains unchanged. Agent runs additionally require signed and current `Agent
run_turn` audience; persistent runs require Session `open/read/append`. Grant
revocation/expiry and these audiences are rechecked every 250 ms and at settlement.
Revocation cancels pending native work; already accepted side effects are not undone.

The optional bridge is Host-trusted ingress requiring both existing control token
and operators assertion. Arbitrary native Hosts holding that token are responsible
for equivalent admission. No credential is created and no permission is granted by
installation. Coordinated Agent implementation: ADR 0119 on branch
`feat/plugin-ai-completion`; SDK namespace is native baggage, not a wire contract
version change. Authenticated file Session writes are unsupported.

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
asserts empty Agent Session lists before and after background work. The scoped-run test uses the original Loop, explicit Session grants and cancellation on revocation; only two explicitly requested Sessions persist. Child process/listeners are
cleaned up. The Agent branch is `feat/plugin-ai-completion`, based on `74f9970`;
its existing history handlers and interactive run implementation are preserved.

## Independent-review P1 corrections

The Agent retains a bounded digest of the exact assertion verified for each active
run. With the existing Host control token, that original snapshot may stop only
that run after expiry or revocation. It cannot start/quote/recover another run or
stop one admitted under another assertion. A fresh valid assertion of the same
owner still supports normal stopping. Active records disappear after worker
settlement. No new key, credential or broad expired-actor access is introduced.

Concurrency admission now counts every row without an explicitly settled execution
state, independently of its retained charge. A failed remote cancellation, HTTP
timeout or process disconnection leaves the slot occupied across adapter restarts.
Successful provider terminal evidence permits `settled_unknown` recovery with the
full charge retained. Lost/failed/cancelled receipts still require operator
reconciliation; no automatic cleanup or retry is introduced.

Six actual cross-process tests passed, including a two-second admitted assertion,
403 denial of expired start/quote/recovery/other-run cancellation, successful
original-run stop, automatic Console guard expiry, injected cancellation 503 and
timeout, Agent process disconnection, and native adapter restart with concurrency
one. Failed/uncertain runs preserve charge and create no second reservation.
The existing completion and scoped Session regressions also passed. Evidence:
`/tmp/lenso-p1-cross-process.log`, `/tmp/lenso-p1-console-unit.log`,
`/tmp/lenso-p1-console-clippy.log`, `/tmp/lenso-p1-agent-clippy.log`.
The isolated Agent fixture executable is under `/tmp/lenso-p1-agent-target` after
external removal of the prior worktree build cache.
