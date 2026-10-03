# Configurable Console assistant access

The authenticated assistant uses the ordinary Console Agent proxy. Auth owns
login and signs the actor assertion; Console obtains it from the authenticated
invocation context, discards browser-supplied actor headers, and sends it to the
Agent with the Host-private bearer. Agent independently verifies the issuer,
key, audience, expiry and user kind before admitting a request. Session owners
retain the existing issuer/subject identity; changing a session identifier never
changes its owner. This feature requires an Agent source build with the
`--assistant-authority`, `--assistant-providers` and `--assistant-scheduling`
options. The currently pinned distribution binary is not changed by this work.

## Access policy and migration

Omitting `assistant_access` preserves the existing local or authenticated
administrator behavior, including App Agent control. Existing ownerless sessions
stay in that original local scope. Do not use that compatibility mode for member
traffic. Set `require_user_session = true` and an explicit policy to enable the
owned assistant. An explicit empty policy denies everyone, including
administrators; an assistant grant does not grant Console administration.

Example Console Plugin configuration overlay:

```json
{
  "require_user_session": true,
  "administrator_subjects": [],
  "assistant_access": {
    "enabled": true,
    "subjects": ["existing-auth-subject"],
    "roles": [],
    "allow_administrators": false
  }
}
```

The policy can also admit signed Auth role claims using `roles`, or check the
independently bound Access Control capability for `assistant.use`:

```json
{
  "enabled": true,
  "permission": { "scope_kind": "deployment", "scope_id": "example" }
}
```

Subject, role and permission grants are alternative ways to admit a user.
Revoked login credentials are rechecked on each Console request. The Agent turn
keeps its captured assertion rather than switching account mid-turn; downstream
providers reject expired authority. Assertion issuance must include the Agent
and provider operation audiences listed in Agent's authenticated Web ADR and in
the real acceptance fixture. Providers require the same immutable verification
key. No signing secret belongs in Console configuration.

Enabled member access requires an Agent that reports authenticated assistant
ingress at readiness. Console rejects a legacy or misconfigured Agent at boot;
Agent also rejects the Console actor header in unsigned operator modes instead
of silently treating that request as an ownerless operator. Existing unsigned
single-operator requests remain compatible.

Audience grants must cover every invoked hop. For the admitted `ask_user` tool,
this includes `lenso.agent.tools@2:execute_stream` and
`lenso.agent.tool-provider@2:execute`, then User Interaction `ask`, `pending`
and `answer`; configured before/after tool hooks need their own exact grants.
Kernel target projection drops an assertion at an ungranted intermediary, so
granting only the final interaction operation intentionally fails closed.

The session response exposes `assistant_enabled`. Granted members can enter the
Agent and `/settings/ai`; that page shows only their admitted providers and
personal credential status. Permission failures retain their server error and
never require promotion to administrator. Members do not receive global Agent
profile, plugin, credential connection or terminal controls. Tasks without a
member ownership contract remain unavailable. The member tool allowlist starts
empty; this slice supports only the owner-aware `ask_user` tool and also narrows
the Host's existing grants. Shared Memory is unavailable to members.

## Provider and capacity policy

Agent's separate provider policy configures platform sharing, exact user or
group assignments, and optional BYOK. The identity key is the JSON pair
`[issuer, subject]` produced by verified ingress. Provider definitions prepare
separate immutable Homes; their Session database, Artifact directory and Auth
verification configuration must agree with the default history Host. Member
providers use configured model instances in separate Homes; named Host Profiles
are rejected because they can replace durable storage bindings. A provider's
model is chosen by that policy, not a model
or provider supplied by another user.

`GET /api/console/v1/assistant/settings` returns the user's provider choices,
selection, `byok_enabled` and `has_byok`. `PUT` accepts `{ "provider_id": "id" }`
or `{ "byok": { "provider_id": "id", "api_key": "..." } }`. Sending
`{ "byok": null }` removes the selected personal credential. These requests
cannot choose an owner, endpoint, global instance or secret reference. BYOK is
restricted to trusted platform templates and stored by the encrypted-file
Secrets provider. Settings responses never return keys. Both platform and BYOK
member providers reject named Host Profiles at startup. Existing local operator
Profile controls remain available in the legacy mode.
`max_byok_revisions_per_user`, `max_byok_revisions_total` and
`max_cached_provider_hosts` configure retained credential and resident Host
capacity (defaults 8, 128 and 32); changing a credential retains an active turn's lease. Deleting BYOK does not
reset retained revision capacity; automatic reclamation is outside this slice.

Agent scheduling configures `global_running`, `per_user_running`, `global_queue`,
`per_user_queue`, `fair` and `queue_policy` (`queue` or `reject`). Compatibility
defaults keep one running turn; use a higher global capacity for concurrent
members, for example:

```json
{
  "global_running": 4,
  "per_user_running": 2,
  "global_queue": 32,
  "per_user_queue": 8,
  "fair": true,
  "queue_policy": "queue"
}
```

A session remains sequential. Full queues reject admission; cancel and
interaction commands remain responsive while other turns wait on upstreams.
The reference Console Host also gives its Auth binding a bounded 64-request
mailbox while retaining one authentication permit, so concurrent browser reads
can wait for credential verification. Shared operator activity recovery is
unavailable to members and is declared unavailable in bootstrap capabilities.
Native Rust, ordinary Bun and Process plugins remain trusted installed code.
Ownership checks and tool grants are application boundaries; they do not provide
OS isolation between hostile native plugins.

## Focused acceptance

[`tooling/multi-user-assistant/run.sh`](../../tooling/multi-user-assistant/run.sh)
uses real Account/Password plugins, a temporary PostgreSQL database, real Web
Ingress and Console proxy, a real Agent binary, and synthetic HTTP model
credentials. It checks separate authenticated users, denied members, provider
and history separation, slow-turn concurrency, session ordering, cancellation
and interaction rejection, and BYOK without credential disclosure. Optional UI
hold mode serves the built Console assets for rendered browser review. It does
not publish packages, deploy services, or use real provider credentials.
