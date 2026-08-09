# Lenso Console Service

This directory is the independently installed Lenso Service behind Lenso
Console. It owns dedicated Auth and Organization domains, a Host-owned Console
Access store, Service Store, API, Worker and Migration Workload. It is never
embedded in or registered as one of its managed Services.

The initial exact composition is:

- the capability-neutral `lenso/console-shell` linked Module;
- the first-party Auth anchor;
- the first-party password provider;
- the first-party Organization Module;
- the mandatory `lenso/system-registry` linked Module;
- the Host-owned `lenso/console-access` linked Module;
- the optional `lenso/platform-story` linked Module, including Story query,
  federation, projection, and Store migration ownership.

The process fails closed unless `LENSO_COMPOSITION_PROFILE=core` and
`SERVICE_NAME=lenso-console`, and it requires
`LENSO_MODULE_PLATFORM_STORY_ENABLED=false` while supported framework releases
still contain the former built-in Story Module. This prevents the framework
demo profile or legacy Story route from adding unreviewed or duplicate Modules.

## Local start

```sh
cp service/.env.example service/.env
docker compose --env-file service/.env -f service/docker-compose.yml up -d postgres
cargo run --locked --manifest-path service/Cargo.toml --bin lenso-console-migrate
pnpm service:serve
```

After the Console Service starts, the first operator is created only through an
explicitly fenced local recovery request. Set a strong, temporary
`CONSOLE_BOOTSTRAP_RECOVERY_TOKEN`, start the service with
`CONSOLE_RECOVERY_MODE=restore`, and call the recovery endpoint once:

```sh
export CONSOLE_BOOTSTRAP_RECOVERY_TOKEN="replace-with-a-random-one-time-secret"
curl -X POST http://127.0.0.1:3030/bootstrap/v1/recovery \
  -H 'content-type: application/json' \
  -H "x-lenso-console-recovery-token: $CONSOLE_BOOTSTRAP_RECOVERY_TOKEN" \
  --data '{"identifier":"admin@example.com","password":"replace-with-a-strong-password"}'
```

The endpoint refuses normal-mode requests, missing or mismatched recovery
tokens, and any request after a Console administrator exists. It creates a
local-recovery Bootstrap Superadmin through the Console Auth and Password
Modules and returns a short-lived login token. Store that token only for the
initial sign-in, remove the recovery secret, and restart in
`CONSOLE_RECOVERY_MODE=normal`. Additional Console identities, organizations,
memberships, and Managed Service Access Grants are managed through the
Host-owned Console Access API under `/api/console/v1/access`; no
shared Auth configuration key is used.

The Console Shell and API share `http://127.0.0.1:3030` by default. The Shell is
served at `/`, the System Registry API is under `/api/console/v1/services`, and
the authenticated composition diagnostic is available from
`/api/console/v1/composition`. It reports the exact Shell, identity role,
System Registry role, and optional Module selection bound into the Service
Release. The Shell independently validates the response and enters Recovery
Mode instead of mounting management routes when a mandatory role is missing,
ambiguous, or incompatible. The same diagnostic exposes `workloadMode`; a
`restore` workload keeps the Shell on its dedicated recovery authority screen
until reconciliation and separately approved activation return the Service to
`normal`. The unauthenticated, read-only `/health/authority` probe exposes only
the fixed Console Service identity and current workload mode so the external
installation authority can verify the running process before committing
activation or rollback evidence. The Console Service probes are `/health/live`,
`/health/ready` and `/health/startup`. `pnpm service:serve` builds the Shell before starting the
API and embedded Worker. Packaged deployments may set `CONSOLE_WEB_ROOT` to an
absolute directory containing the built `index.html`; the API fails closed when
the Shell build is absent.

Module Console UI artifacts are owned by this Service, not by managed Services.
Operators with the `console.artifacts.manage` capability may reconcile reviewed
artifacts through `POST /api/console/v1/artifacts/reconcile`. The Service
downloads each HTTPS npm-style web archive with a bounded response size,
verifies its exact SHA-256 digest and `lenso.console-module.v1` manifest,
rejects unsafe archive paths, materializes only `dist/`, and writes a
content-addressed object plus an atomic composition receipt. Container
deployments persist this Console-owned store at
`/opt/lenso-console/artifacts`; it remains writable only by the container's
unprivileged UID `10001`. `GET /api/console/v1/artifacts` exposes the applied
receipt to authenticated Operators. Entries are loaded by the prebuilt Shell
through `/artifacts/<digest>/` as same-origin ESM. No embedded browsing context
or separate bridge runtime is required.

## Container installation

The repository builds one OCI image containing the Console Shell plus the API,
Worker, and Migration Workloads. Copy the container environment template, replace
both password occurrences with the same URL-safe random value, and start the
stack:

```sh
cp service/.env.container.example service/.env.container
docker compose --env-file service/.env.container -f service/compose.yml up --build -d
```

Compose waits for PostgreSQL, runs the deterministic migration workload once,
then starts the combined API and Worker workload. The Console container runs as a
non-root user with a read-only filesystem and no Linux capabilities. Database
state is the only named volume; the Console image and process remain disposable.
Compose requires `CONSOLE_RECOVERY_MODE` to be explicit, and the container
environment template selects `normal` for an ordinary installation.

Run `pnpm service:container:smoke` to build an isolated image and prove migration,
readiness, Shell deep links, protected API responses, and reserved API 404s. The
smoke stack uses its own Compose project and volume and removes both on exit.

Run `pnpm service:recovery:smoke` to execute the destructive recovery drill in
two isolated Compose projects. It streams a custom-format Store backup into a
fresh PostgreSQL volume, excludes browser sessions, proves restore-mode mutation
fencing, activates the recovered Console, observes the resulting Store drift,
and re-establishes the recovery fence. It also verifies that the authenticated
composition diagnostic reports `restore`, `normal`, then `restore` in lockstep
with those authority transitions, and independently verifies the same sequence
through `/health/authority`. The machine-readable result conforms to
`service/recovery-drill-result.schema.json`; set
`LENSO_CONSOLE_RECOVERY_DRILL_OUTPUT` to retain it after cleanup.

## Release manifest

An official Console Service Release must publish a JSON document conforming to
`service/release-manifest.schema.json`. The document is a GitHub-attested
release artifact from `LioRael/lenso-console` and binds the source
commit, exact OCI digest, Console composition, Store schema, public contracts,
and non-secret configuration contract. It also declares which prior Store
schema digests may be upgraded and names every irreversible migration.

The external CLI verifies that attestation before producing a deterministic
installation plan. Applying a plan requires approval of its exact digest;
releases declaring irreversible migrations require a second explicit approval.
The local adapter requires an explicit `normal` workload mode, pulls the
digest-pinned image, completes its migration workload, starts the Console
workload, waits for container health, and verifies the running
`/health/authority` identity and mode before recording the applied release
state:

```sh
lenso console install --manifest lenso-console-release.json \
  --root /srv/lenso-console --output install-plan.json
lenso console install --manifest lenso-console-release.json \
  --root /srv/lenso-console --env-file /secure/console.env --apply \
  --approve-plan-digest sha256:<reviewed-plan-digest>
lenso console doctor --root /srv/lenso-console \
  --live-url https://console.example.com --json
```

Upgrade uses `lenso console upgrade` with the same plan-and-approval protocol.
Before planning an upgrade, the CLI revalidates the installed manifest's GitHub
attestation, requires the manifest and generated Compose deployment to exactly
match the applied state, and rejects same-version or lower-version targets.
Each applied change records a secret-free `installation-attempt.json` containing
the target release, approved plan digest, phase, and final status so doctor can
surface an interrupted migration or readiness wait after the original process
has exited.
An OS-backed `installation.lock` serializes the complete apply window, including
the state reread and plan approval check. Concurrent changes fail without
mutation. A process crash releases the kernel lock but leaves an active record for
doctor; the next apply can safely claim that unlocked stale record.
`lenso console backup` uses that same lock and verifies the installed release
before streaming a PostgreSQL custom-format dump directly into `age`. The
resulting Recovery Set contains no plaintext Store file and its manifest binds
the encrypted payload to the exact release, image, Store schema, composition,
contract, configuration, external Secret Reference, and restore preconditions.
Live `auth.sessions` rows are excluded and that rule is recorded inside the
protected manifest, so a restore cannot revive old browser sessions. The CLI
refuses to overwrite an existing Recovery Set. Restore stays gated
by a deterministic plan and approval of its exact digest. The current
environment must use `CONSOLE_RECOVERY_MODE=normal`; the recovery environment
must use `CONSOLE_RECOVERY_MODE=restore` and identify a distinct, empty Store:

```sh
lenso console restore --root /srv/lenso-console \
  --recovery-set ./console-recovery-2026-07-30 \
  --current-env-file /secure/console.env \
  --recovery-env-file /secure/console-recovery.env \
  --output restore-plan.json
lenso console restore --root /srv/lenso-console \
  --recovery-set ./console-recovery-2026-07-30 \
  --current-env-file /secure/console.env \
  --recovery-env-file /secure/console-recovery.env \
  --apply --approve-plan-digest sha256:<reviewed-plan-digest> \
  --identity-file /secure/console-recovery-identity.txt
```

Apply validates the manifest and encrypted payload, proves the owner-only `age`
identity can decrypt a readable PostgreSQL archive, and confirms the isolated
target Store is empty before it fences the current deployment. It streams the
archive into a transactional `pg_restore`, starts only the recovery-mode
Console, and writes durable failed or awaiting-reconciliation evidence. Doctor
continues to fail on that evidence. The restore command never proves
single-deployment authority, reconciles identity/enrollment continuity, or
returns the workload to normal mode; those remain separately reviewed recovery
steps.

`lenso console recovery reconcile` is the only transition from
awaiting-reconciliation to ready-for-activation. It reads the passive restored
Store, rejects `auth.sessions` predating recovery while allowing newly
authenticated recovery operators, records Outbox status counts and a streamed
digest of the exact Outbox rows, and
binds every managed Service's principal, enrollment receipt, authorization
epoch, and Core document digest to operator-reviewed external evidence. The
deterministic reconciliation plan requires approval of its exact digest before
the CLI publishes `reconciliation-evidence.json` and updates recovery state.
Evidence references are opaque non-secret identifiers; credentials and signing
material must not be embedded. Ready-for-activation remains a failed doctor
state and does not enable the Worker, management mutations, or normal mode.

The wire contracts are
`service/reconciliation-input.schema.json` and
`service/reconciliation-evidence.schema.json`. Both are part of the attested
Console release contract digest.

`lenso console recovery activate` creates a separate deterministic plan bound
to the Recovery Set, restore plan, reconciliation evidence, installed release,
and restored Store identity. Apply requires both the exact plan digest and an
explicit authoritative-writer transfer approval. Immediately before transfer,
the CLI re-observes the Store: new recovery-operator sessions are allowed, but
the Outbox snapshot and managed-Service identity set must still exactly match
the reconciliation evidence. A normal-mode startup failure automatically
starts the recovery-mode workload again and leaves doctor failed. Success
publishes content-addressed `activation-evidence.json`; doctor accepts recovery
only after that evidence and the activated state agree. The evidence binds the
digest of the running Service's exact `/health/authority` response instead of
inferring workload mode from container health. An interrupted
authority transfer remains failed and requires operator intervention rather
than being inferred as successful.

The activation evidence wire contract is
`service/activation-evidence.schema.json` and is part of the attested Console
release contract digest.

If activation is interrupted or its automatic recovery-mode restart fails,
`lenso console recovery recover-activation` is the reviewed intervention path.
Its deterministic plan requires an exact digest and explicit authority-reset
approval. Apply stops any possible normal-mode writer, starts the restore-mode
workload, observes the fenced Store, and publishes
`activation-recovery-evidence.json`. The state then returns to
awaiting-reconciliation rather than ready-for-activation: operators must review
the potentially changed Outbox and managed-Service identities again. The
intervention evidence binds the verified `restore` authority probe. Every
reconciliation, activation, and intervention receipt is retained under the
owner-only `recovery-evidence/` history while the corresponding canonical file
tracks the latest receipt. A symbolic-link history directory is rejected.

The activation recovery wire contract is
`service/activation-recovery-evidence.schema.json`. Reconciliation evidence may
bind `activationRecoveryEvidenceDigest` to retain the complete retry lineage;
both schemas are part of the attested Console release contract digest.

Every Console workload must set `CONSOLE_RECOVERY_MODE` to exactly `normal` or
`restore`; missing and unknown values fail startup. Restore mode keeps the API
available for inspection but does not start the embedded Worker, rejects a
dedicated Worker process, and returns a conflict before executing System
Registry management mutations. Returning to normal mode requires an external
deployment change after reconciliation; the Console cannot remove its own
recovery fence.
If the candidate does not become healthy, the CLI preserves the previous
canonical deployment files and installation state and does not describe the
candidate as installed. Operators should run `lenso console doctor` with the
Console `--live-url` before retrying or intervening; the CLI does not
automatically run an older binary against a Store that may already contain
forward migrations.
Release manifests, plans, and installation state must never contain database
credentials, signing material, passwords, or other secrets; those stay in the
operator-owned environment file.

`service/release-inputs.json` is the repository-owned inventory used to derive
the composition, Store schema, contract, and configuration digests.
`service/release-policy.json` declares upgrade-compatible prior schema digests
and names irreversible migrations. The local OCI workflow generates a
deterministic manifest after its build has produced a canonical digest. The
same operation can be run locally:

```sh
pnpm service:release-manifest \
  --version 0.2.0 \
  --source-commit 0123456789abcdef0123456789abcdef01234567 \
  --image ghcr.io/liorael/lenso-console@sha256:<image-digest> \
  --output .artifacts/lenso-console-release.json
```

The repository-local release workflow builds and pushes
`ghcr.io/liorael/lenso-console:<version>` only after the private root package
version changes through a merged Changesets version update. It refuses to
overwrite an existing version tag, emits a digest-pinned release manifest,
publishes a GitHub build attestation, and attaches the manifest to the
`lenso-console-service@<version>` GitHub Release. There is no shared shadow
registry, central publisher, release nonce, or cross-repository receipt channel.

Registry reads require `console.system-registry.read`. Typed Module Operations
are exposed only through the fixed Console proxy paths and require an
operation-specific Console scope. Each request rechecks the current enrollment,
Core advertisement, capability/schema digest, explicit Managed Service Context,
and typed response before returning inventory, Action Contributions, or
descriptor-bound configuration evidence.

No enrollment creation endpoint is exposed yet. Enrollment changes remain the
reviewed bilateral System Plane workflow; adding a direct unsigned
registry-write route would violate that boundary. Module Operations consume the
published framework contract from `lenso@0.3.38` without creating a second
TypeScript wire schema.

The Console Service does not maintain a second TypeScript backend for the System
Plane. Its backend capabilities are implemented as ordinary Rust Lenso Service
and Module code. System Plane wire contracts and verification primitives belong
to the public Lenso framework; the Console Service is now a typed consumer of
the published Module Operations contract while enrollment authority remains
fail-closed here.
