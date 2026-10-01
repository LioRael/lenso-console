# Completion admission checkpoint

This package is the independently testable admission core of the proposed
optional Console AI adapter. It is not registered as a Plugin provider and has
no public endpoint. Installing or enabling the assistant does not expose it.

The Host supplies a verified consumer/user/project tuple and administrator
purpose profile. An exact model, explicit price revision, trusted input-token
upper bound, output ceiling, budget reservation and concurrency slot are
required before completion. Unknown prices or meters fail closed. Integer cost
arithmetic is checked. Mismatched model/pricing/usage evidence fails without
fallback and retains the full reservation. Successful evidence settles actual
usage. Completion has no Session writer or session identity parameter.

The ledger is single-process memory. **Do not expose this implementation in
production until reservations and run evidence are durable**, the Host identity
and realm/audience binding are wired, and the trusted provider bridge is complete.
The provider abstraction currently has only synthetic test implementations.
Purpose profiles are administrator-owned Rust values; no browser configuration
or consumer-supplied price/token authority is accepted through an endpoint.

Run `cargo test --offline --locked -p lenso-console-agent-ai-adapter` and
`cargo clippy --offline --locked -p lenso-console-agent-ai-adapter --all-targets -- -D warnings`.

The matching Agent checkpoint is on `feat/plugin-ai-completion`, based on
`74f9970`, in its dedicated Worktrunk worktree. It adds only a typed Model lease
under `generation/plugin_ai.rs`; no Web ingress or history handler changes.
Remaining work: authenticated bridge, durable quota/run ledger, actual provider
pricing and bounded metering, optional capability registration/Host wiring,
stream cancellation settlement, multi-round run policy and explicit session-write
grants. Existing history reopen/project-switch behavior is not changed here.
