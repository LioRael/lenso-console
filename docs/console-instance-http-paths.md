# Fixed Console instance HTTP paths

Each Console Plugin Instance keeps one resolved Auth client. `http_paths` exposes
that instance at fixed, same-origin paths; it does not select a realm from a URL
parameter. Omitted configuration preserves `/`, `/api`, and `/auth`.

For the user Console instance, use this configuration excerpt:

```json
{
  "require_user_session": true,
  "administrator_subjects": [],
  "http_paths": {
    "shell_base_path": "/console",
    "api_base_path": "/console/api",
    "auth_base_path": "/auth"
  },
  "member_workspace_ids": ["relay.console-5b398829292dcbf51d9ca1ce"],
  "workspace_mounts": [
    { "instance": "relay.console.views/default", "workspace": "relay.console", "path": "/" }
  ]
}
```

Bind Console/default → relay.console.auth/default → Account/default. For the
admin Console instance, use the following excerpt, retaining the trusted issuer,
public key, and deployment values of the existing operators profile:

```json
{
  "require_user_session": true,
  "administrator_subjects": [],
  "http_paths": {
    "shell_base_path": "/admin",
    "api_base_path": "/admin/api",
    "auth_base_path": "/auth/operator"
  },
  "member_workspace_ids": [],
  "operators_profile": {
    "deployment": "EXISTING_DEPLOYMENT",
    "issuer": "EXISTING_TRUSTED_ISSUER",
    "public_key": "EXISTING_TRUSTED_PUBLIC_KEY",
    "management_enabled": false,
    "administrator_workspace_ids": ["relay.operations-786fae3eb65d575b52b07888"]
  },
  "workspace_mounts": [
    { "instance": "relay.console.views/admin", "workspace": "relay.operations", "path": "/" }
  ]
}
```

Bind Console/admin → relay.console.auth/operators → Account/operators. These are
partial examples: replace placeholders using the resolved application catalog
and retain the other required Console configuration and capability bindings.
The workspace IDs above match the publicly inspected Relay `536` descriptor;
reconfirm them if provider owner keys or declarations change. They do not assert
validation of the separately supplied `90c` application candidate.
The API route prefixes, Auth routes, and Auth provider bindings must agree in the
application composition. Shell `/admin/` reads `/admin/api/console/v1/session`
and `/auth/operator/methods`; logout uses `/auth/operator/logout`.

`workspace_mounts.instance` identifies the source UI contribution's Plugin
Instance key. `workspace` is the local workspace declaration ID, before its
owner-scoped catalog ID is generated. `path` is relative to this Console's Shell
base. A root override therefore mounts the workspace at `/console/` or `/admin/`.
An existing declaration at `/console/` or `/admin/` needs this override when the
Shell itself receives that prefix, to avoid a repeated prefix. The override does
not change the Plugin Instance, mount identity, or frozen page implementation.
`member_workspace_ids` and `administrator_workspace_ids` instead reference the
exact exposed catalog `mount.id`, including the owner hash for formal workspaces.

The new administrator workspace list defaults to empty. Every admitted operator
request must still pass operators realm, issuer/key, audience, assertion lifetime,
and deployment `console.operator` authorization. The list permits only the named
administrator workspace catalog, assets, and service adapter. The session's
legacy `administrator` flag remains false, and legacy Console Admin/API remains
closed. `management_enabled` defaults to true for existing operators deployments.
The workspace-only example explicitly disables it: no Management binding is
required, management routes are denied, and the session flag is false.
`human_interface` keeps its independent capability bindings and grants.
Workspace business services must independently verify their own realm
and action permissions. This interface creates no production operator grant.

Prefixes are canonical segment boundaries without a trailing slash (except Shell
`/`). API and Auth prefixes cannot overlap. API cannot equal or contain the Shell
prefix; Shell may contain API, as in `/admin` and `/admin/api`, or be disjoint.
The public HTML bootstrap contains these three paths and, when configured, the
fixed workspace-source allowlist described below. Corresponding Auth
methods provide the CSRF cookie policy; issuer keys and secrets are never added
to the bootstrap. Root and scoped Shells use the same built bundle; dynamic
imports and styles use the instance's asset namespace. Session generation,
expected-subject headers, abort signals, and private query scope remain intact.

## Authorized workspaces in the ordinary Shell

An already-authorized account can discover a separately admitted operator
workspace without opening a second login page. Add `http_paths.workspace_sources`
to the ordinary instance's configuration, retaining its accounts Auth binding.
An empty or omitted list preserves the existing single-instance behavior.

```json
{
  "workspace_sources": [{
    "id": "relay-operations",
    "account_issuer": "EXISTING_ACCOUNTS_ISSUER",
    "shell_base_path": "/admin",
    "api_base_path": "/admin/api",
    "auth_base_path": "/auth/operator",
    "mounts": [{
      "id": "relay.operations-786fae3eb65d575b52b07888",
      "base_path": "/operations/",
      "navigation_checks": [{
        "path": [],
        "service_id": "relay-operator-actions",
        "operation": "describe_permissions",
        "fields": ["can_list_requests", "can_credit"]
      }]
    }]
  }]
}
```

This is an excerpt of `http_paths`, not a complete Console configuration. Use
the existing accounts issuer and exact resolved mount IDs; fixture issuers must
not replace deployment trust. Declare an admission check for each intended
navigation path. The Relay fixture contains the additional channels, routing,
budgets and subscription checks. Unlisted paths and mounts are not discovered.
`base_path` is relative to the ordinary Shell and requires a trailing slash.
Thus `/operations/` is presented at `/console/operations/`, while its catalog,
assets and services remain under `/admin/api`. The original `/admin/` Shell
remains bound to operator Auth.

The allowlist contains canonical same-origin paths only. Catalogs and query
parameters cannot add sources or replace endpoint/asset authority. Overlapping
API/Auth prefixes, duplicate IDs, reserved or conflicting Shell routes, and
external or encoded URLs are rejected before the bootstrap is served.

Discovery checks the existing binding's accounts issuer/subject, then independently
verifies the operator Console session and its read scope. When needed, it calls
the existing operator logout and exchange under the origin-wide identity write
lock. Exchange uses accounts CSRF; operator services use their own methods' CSRF
policy. No bootstrap, binding activation, grant, administrator-subject expansion,
or step-up assurance is added. Cookie writes finish before the lock is released,
even if discovery is cancelled. The exchange redirect is checked against the
fixed original Shell prefix and is never followed.

Navigation checks call existing live service permission descriptions and retain
only explicitly true capability fields. HTTP permission denial and Relay's
`domain_error` `{"error":"denied"}` omit that project; other failures show a
retry state while preserving ordinary workspaces. Visibility never authorizes a
business operation: each service still verifies the live actor, audience, grant
and session ceiling. The session's `administrator` flag remains unchanged.

Each source has an independent expected subject, read scope, CSRF policy and
abort lifetime. Source transitions notify other tabs with only the public source
ID and phase, under the same cookie-write lock. Invalid sessions, permission
denials, account transitions and logout remove the affected providers and
cached reads. Focus and a bounded refresh recheck discovery. Account login/logout
retire declared operator cookies before changing the accounts cookie. This is
not a transaction across all Auth/Access capabilities; live target checks and
credential expiry remain the final boundary.

These changes do not alter UI Contribution, WorkspaceService or GlobalContribution
role schemas, PageProps, SDK WorkspaceServices, or the hash-addressed asset
manifest. No SDK publication is required for this Shell feature.
