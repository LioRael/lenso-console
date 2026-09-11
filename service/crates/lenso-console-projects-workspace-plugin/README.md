# Projects Workspace

This removable, linked Plugin contributes Projects to the existing Console Shell.
It owns the UI module and the owner-scoped `projects` Workspace service. The Console
Host admits it only when `LENSO_CONSOLE_PROJECTS_ORIGIN` is explicitly configured
(or `ConsoleConfig.projects_workspace_origin` is set by an embedding Host).

The configured origin is frozen into the resolved Plugin configuration. Only HTTPS
or loopback HTTP origins are accepted, without credentials, query, path or fragment.
The browser cannot choose another destination. Removing this Plugin removes its UI
and service together; a new Generation starts with no business grant.

## Business authority

`begin_connection` starts the existing business App consent flow. A local opaque
attempt ID and same-origin authorization URL can reach the browser; the polling
secret cannot. `poll_connection` acquires an expiring, Account-owned delegated grant
and keeps it in memory. Account changes are serialized with requests. `disconnect`
drops local authority. Parent session revocation is enforced by the business App;
a 401 drops the cached grant. No automatic mutation retry is performed.

Business requests use a fixed operation/endpoint mapping, bounded bodies and replies,
a 20-second timeout and no redirects. JSON writes include the configured App Origin,
so Hosts mapping bearer evidence to the session scheme retain the existing origin
check. The Console Workspace endpoint requires JSON and does not enable CORS.

The business App must explicitly consent to the exact operations consumed here:
`lenso.projects@1` list/get/create project, list/get/create issue and list activity;
`lenso.projects-admin@1` list teams, project statuses and workflow states.
App membership and record authorization remain authoritative. This connection is
separate from the Agent's business connection; it does not reuse browser cookies or
copy another Agent's credentials. Console is a local, single-user Host.

## Local service protocol

The Console-local domain metadata is `lenso.projects.workspace@1`, descriptor
`1.0.0`. It is a fixed adapter protocol, not a new implementation of the public
Projects or Auth Capabilities. All operations are request/response JSON:

| Operation | Request | Response |
| --- | --- | --- |
| `connection_status`, `disconnect` | `{}` | `{connected, label, subject}` |
| `begin_connection` | `{}` | `{attempt_id, authorization_url}` |
| `poll_connection` | `{attempt_id}` | `{connected, label, subject}` |
| `list_projects` | organization and pagination | `{status, body}` |
| `get_project`, `list_issues` | organization, project ID, pagination where applicable | `{status, body}` |
| `get_issue`, `list_activity` | organization, issue ID, pagination where applicable | `{status, body}` |
| `list_teams`, `list_project_statuses`, `list_workflow_states` | organization, team filter where applicable, pagination | `{status, body}` |
| `create_project` | Existing Projects `CreateProjectRequest` | `{status, body}` |
| `create_issue` | Existing Projects `CreateIssueRequest` | `{status, body}` |

Requests reject destination/credential/actor overrides. Bodies retain existing
business contract field names. The browser does not send capability IDs, provider
instance keys, arbitrary URLs, headers or methods. The service export and UI
requirement lists are derived from one operation table.

## UI provenance

The React content is maintained in `LioRael/lenso-projects-web-plugin/web`. Build it
there, then run `node scripts/import-projects-workspace.mjs PROJECTS_WEB_ROOT` from
Console. The importer records SHA-256 hashes in `assets/manifest.json`. The native
module receives Console's React runtime and theme, and creates a local Lenso UI
portal scope following that theme. It does not create a React root or another shell.
The default business HTTP page is only a minimal fallback.

Validation includes Plugin unit tests, Host admission, compiled browser tests in
Projects Web, and real Auth/Projects/Console acceptance in the Agent repository's
`scripts/projects-acceptance/console-browser.mjs`. The live acceptance uses disposable
accounts and Postgres, no intercepted business responses and no model calls.
