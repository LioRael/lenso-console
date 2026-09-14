# G3 Marketplace event-host qualification

The Marketplace Directory and Web Plugins use their normal generated contracts,
resolved Plugin Root and portable signed catalog protocol. Native SQLite remains
the default. The Workers host injects private D1/R2 storage and an event clock;
no signing private key or Agent installation connection is added to public reads.

The proof is restricted to `lenso-marketplace-g3-proof` resources and deterministic
synthetic trust. It is not an official catalog, production deployment, or an
unrestricted Workers capacity claim.

## Covered behavior

- Exact signed bytes, native persisted-cache replay and Workers verification.
- Same-revision equivocation, invalid signature, expiry and rollback rejection.
- Immutable release identity after omission; full accepted-checkpoint object
  integrity, including historical identity entries.
- Durable checkpoints across Wasm generation retirement, storage failure and
  recovery without lowering the rollback fence.
- Bounded admission and a 3,609,427-byte signed catalog, including exact raw response.
- Event cancellation, bounded uncertain native-I/O settlement and stale callback
  fencing. A cancelled read still releases a body returned by late R2 completion;
  an absent-object lookup cannot begin a new write after cancellation.

A JSON byte-array response initially grew Wasm memory above 226 MiB and failed on
the deployed Worker. Canonical bounded Base64 at the Host response boundary
removed that allocation amplification. Final measurements report **Wasm linear
memory**, not total isolate peak memory. The profile admits one active event per
isolate, retires at 16 admissions, uses a five-second event boundary and limits
request/response bodies to 64 KiB/4 MiB. These are qualified proof constraints,
not an approved production throughput budget.

A repeated create-only upload of an existing large R2 object returned a network
failure. The adapter now reads and compares existing immutable bytes first. If
absent, creation remains conditional; a losing conditional create must match
exact bytes. The D1 compare-and-swap always runs. Unknown write outcomes are
reported as failures and never blindly retried or treated as rolled back.

The current Kernel retires the Directory provider and its consumer on a storage
PluginFailure. Therefore a storage outage can produce 503 despite a persisted
checkpoint; this proof does not promise a warm-cache 200. The preserved checkpoint
still rejects stale or altered releases after recovery.

## Reproduction

Use the [pinned cohort bootstrap](../docs/cohort-bootstrap.md), build the existing
Marketplace UI assets, then run `CARGO="${LENSO_CARGO:-cargo}" bash build.sh` from this
Workers directory with Rust 1.94.0 and wasm-bindgen CLI 0.2.127. Install the locked
pnpm dependencies before Wrangler. Apply the explicit migration to dedicated
proof resources; never run the destructive smoke against production data.

Generate fixtures with the catalog `workers_fixtures` example and replay them with
`workers_native_replay`. `proof/smoke.mjs` runs the public-read proof locally or
remotely. `node --test storage.test.mjs storage-scope.test.mjs` covers private
adapter cancellation and continuation ownership. The separate CAS proof records
real competing D1 writes; see its dedicated instructions.

Production domain, signing ownership, renewal, paired-state backup and forward-only
recovery requirements are in [G5 preflight](../docs/g5-preflight.md) and the
[rollout runbook](../docs/g5-rollout.md). Public production configuration is rendered
by `proof/deployment-config.mjs`; it rejects the known proof trust and legacy
catalog hostname and performs no deployment. No production catalog or registry
package has been published by this qualification.
