# Local Console administration

This loopback application explicitly installs the optional Auth Console
administration service and three compiled plugin workspaces. It is not a
production identity provider or a production migration.

## Start an isolated instance

Use Bun 1.4.3 and the repository's dependency preparation. Supply the operator
login secret through your environment or secret manager as `LENSO_TS_TOKEN`;
never put it in `local.json`, a committed file or a command-line argument.

```sh
bun run prepare:runtime
bun install --frozen-lockfile
bun run service:ts:prepare
```

The existing operator-only example remains the default. To select the new
administration assembly:

```sh
export LENSO_TS_ADMINISTRATION=true
# LENSO_TS_TOKEN must already be supplied securely.
# Choose a new, disposable database path for local experiments.
export LENSO_TS_DATABASE=/absolute/path/to/disposable/console.sqlite
```

**Instance creation grants the configured operator its first Console membership.**
Run it only after explicitly approving that new local instance:

```sh
bun examples/ts-console/initialize-administration.ts --create-instance
bun examples/ts-console/locale-store/migrate.ts "$LENSO_TS_DATABASE"
bun run service:ts
```

The initializer refuses implicit creation, and an existing instance is not reset
or reseeded. Starting the host never reapplies deployment role defaults. A
production first administrator, schema migration or change to an existing
instance requires a separate owner-approved procedure; these commands are not
that authorization.

Open the configured loopback origin (default `http://127.0.0.1:3100`) and sign in
with the configured operator identity and login secret. The three groups are:

- `/identity/`: directory search, cursor pages, user detail and supported session
  administration. The application owns the directory; Auth does not require a
  fixed account table.
- `/access/`: Console-scoped membership, roles, effective permission sources,
  separate administrator promotion and revision-aware changes.
- `/agent-connections/`: the actual MCP resource address, personal-token lifecycle and
  observed audit events. An address alone never means a client is connected.

The application directory can be replaced by a custom source's management
interface. Unsupported disable/session actions remain unavailable. Business
identity status, Console membership and wallet/consumption state are independent;
this example installs no wallet owner.

## Shared authority

`@lenso/auth-console/administration/server` owns ordinary async management methods
and their explicit Manage declarations. Console and MCP bind the same installed
service. A host-created invocation proves caller provenance; actor claims in
business JSON do not establish identity.

Membership and roles share a Console/tenant/realm-qualified revision and atomic
commit boundary. Last-administrator and recovery-grant-authority checks run at
that boundary, not only in the UI. Presets explain actual action sets; ordinary
administrators do not inherit the instance owner's delegation authority.
Promotion and role editing require independent grant authority and cannot be
used for self-elevation.

The combined access snapshot requires both `members.list` and `roles.list`.
Directory actions remain source-dependent. Writes carry a captured revision and
use strict Audit intent/outcome handling. A conflict or uncertain write outcome
requires reload/inspection, not automatic destructive retry.

Token creation and rotation use protected human-only POST routes and one-time
secret delivery, outside the generic Manage/MCP catalog. API Keys persists
digests, subject/resource namespace, exact scopes, expiry and revocation. Current
subject and membership permissions intersect the token ceiling on use. Use
zero overlap for immediate old-credential invalidation when rotating. No
per-call last-used timestamp write is added.

## Codex configuration

The official [MCP guide](https://learn.chatgpt.com/docs/extend/mcp.md?surface=cli)
documents Streamable HTTP and Bearer-token support. The official
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
and Codex's published configuration schema expose `bearer_token_env_var`.
Check your installed Codex CLI's `mcp add --help` for version-specific flags.

Take `MCP_URL` from the Agent connections page. Supply `LENSO_MCP_TOKEN` through
your environment or secret manager, using the personal token shown once by
Console. Do not paste it into TOML, a URL or a shell-history command.

```sh
codex mcp add lenso --url "$MCP_URL" --bearer-token-env-var LENSO_MCP_TOKEN
```

Equivalent non-secret configuration:

```toml
[mcp_servers.lenso]
url = "https://YOUR-CONSOLE-HOST/EXACT-MCP-RESOURCE-PATH"
bearer_token_env_var = "LENSO_MCP_TOKEN"
```

Use the actual loopback URL instead for an isolated local test. Production
requires the application's approved HTTPS ingress. This is a custom personal
token flow, not OAuth; do not run `codex mcp login` for it. Other clients must
support an explicit Bearer header. Hosted/cloud agents may not reach a loopback
resource and are not assumed to share Codex's configuration or token support.

## Protocol release boundary

This repository consumes the published `@lenso/mcp` 0.5.0. Its HTTP entry uses
`authenticationMode: "personal-token"` with the trusted `personalTokenIssuer`,
not a fake OAuth authorization server or discovery-suppression wrapper.
Tools have stable names derived from the exact plugin/method identity,
permission-bound cursor pages and bounded JSON text plus `structuredContent`.
Clients should select tools from their declared operation metadata, not catalog
positions. The host retains the default page size; the isolated protocol fixture
sets `listPageSize: 2` to exercise real `tools/list` cursor requests.

The resource shares the existing Console listener and verifies credentials on
every request, including requests in an existing protocol session. Dispatch and
disclosure retain fresh policy checks. No source aliases, unpublished package
overrides or new Auth/API Keys release are used. MCP publication does not mean
the Console release is complete; Console integration and release remain pending.

The local personal-token profile explicitly approves directory, session, access
inspection, own-token metadata and audit reads. Its Auth source delegates token
verification to API Keys and preserves the resulting Auth actor for the session
administration staff Access over the same target SessionStore. No actor is
reconstructed from tool JSON or copied into the interactive Auth owner.
Agent writes and human approval delegation are not enabled.

Custom-source persistence requires `subjectActiveAtCommit`: an authoritative
synchronous activity check participating in the store's commit transaction.
Omission is rejected, not treated as active. External directories require an
owner-provided synchronization/fencing design; a stale status cache cannot
provide the last-active-administrator guarantee. No fixed user table is required,
but remote directory state cannot be assumed atomic with this SQLite store.

Permission-changing writes retire the old trusted read scope. If Shell asks to
retry the session, use **Retry session** to re-admit the valid cookie; do not
resubmit the completed mutation.

## Focused validation

```sh
bun run sdk:build
bun run --cwd packages/console build
bun run --cwd packages/console-runtime build
bun run --cwd packages/auth-console build
bun run service:ts:pages
bun run bundle:local
bun run service:ts:typecheck
bun test examples/ts-console/administration-host.test.ts
```

Run browser checks against the built host with disposable test-owned identities,
membership and tokens. Protocol-client validation is not a claim that Codex
performed a tool call. No production account, credential or permission should
be created by these tests.
