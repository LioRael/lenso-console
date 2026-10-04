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
The public HTML bootstrap contains only these three paths. Corresponding Auth
methods provide the CSRF cookie policy; issuer keys and secrets are never added
to the bootstrap. Root and scoped Shells use the same built bundle; dynamic
imports and styles use the instance's asset namespace. Session generation,
expected-subject headers, abort signals, and private query scope remain intact.
