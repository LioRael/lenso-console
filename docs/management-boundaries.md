# Management entry review

Baseline: `7fa8d71ed203e288f1b052597d048ab7d945f087`.

| Existing entry | Current authority | Migration boundary |
| --- | --- | --- |
| Workspace service dispatch | Auth assertion propagated through Plan-bound owner exports; domain owner checks resource permission | Keep owner operation and exact binding; a custom page cannot create another authority |
| `/api/console/v1/apps/...` | Loopback target allowlist, shared control bearer, configured Plugin control routes | Local compatibility only; operators profile rejects these routes and connections |
| Console/App Agent proxy | Shared administrator control; independent Agent catalog | Disabled in operators profile until per-user delegation and the common management invocation boundary exist |
| Plugin configuration proposals and lifecycle | Selected Host configuration authority, revisions and proposal digest | Does not establish business approval or deployment RBAC; do not project it as a general business tool |
| `administrator_subjects` | Explicit legacy subject list after Auth login | Rejected when operators profile is selected; no silent import into scoped roles |
| Native Projects Workspace | Signed original actor, Projects membership and Access Control | Keep the business owner checks; member workspace visibility is not permission |
| External connections | Host-configured loopback transport and shared credential | An operators deployment cannot inherit them as remote delegation |
| Local launcher and control-token file | Explicit loopback process topology and Host-private token | Remains local compatibility; never enters browser storage or the generated Plan |

`operators_profile` explicitly selects a separate Auth issuer/public key and a
deployment scope. The Shell verifies the authenticated assertion's signature,
issuer, operation audience and expiry, then asks the bound Access Control
provider for current `console.operator` permission in `deployment/<id>`.
The same subject from the App issuer does not qualify. A missing Auth or Access
Control binding rejects activation. A required provider failure denies requests.

This profile admits the session endpoint, explicitly selected Workspace paths,
and the bound Management catalog, invoke and status operations. Human approval
and token routes require the separately selected human interface and owner
ports. Shared Agent and Plugin control routes remain closed.
Existing loopback/local configuration remains explicit and unchanged; selecting
operators requires a deliberate configuration change and independent login.
The reference launcher still binds loopback and an HTTPS deployment still uses
the existing secure cookie, CSRF and origin controls.

C0 is reviewed. The optional core now has current credential ceilings and
revocation, deployment qualification, bound Approval/Audit owner ports, durable
invocation receipts, and guarded human decisions and PAT lifecycle. Independent
operators and App issuer keys are exercised in Native owner integration tests.
The browser retains only receipt references; one-time PAT secrets stay in the
current authenticated view. Browser mutations carry an expected-subject
precondition, matched against fresh owner authentication before dispatch. A
changed account receives `412 session_changed` and revalidates its view while
preserving the previous subject's receipt reference.

PAT metadata comes from the Auth owner. “Last authenticated” records an accepted
authentication, rather than a completed business operation. An authorized list
can reconcile a lost revoke response only when the exact credential and
deployment match the retained request and the owner supplies a token-specific
`revoked_at`. Inactivity or expiry alone leaves the operation unknown. This
confirms the owner postcondition without attributing its timestamp to the lost
invocation or dispatching another revoke; the durable audit outbox still needs
delivery before the response is available.

[Migration preview, import, and switch](management-migration.md) deliberately
imports qualification without granting RBAC or carrying old sessions across
realms. Shared legacy Agent/control connections remain closed in this profile.

Ordinary source App HTTP/MCP/ToolProvider and browser qualification receipts are
separate from those owner and UI fixture results. Workers Management has not
been qualified. The optional-installation matrix and independent Agent delegation
must be recorded against their actual selected profiles before making a broader
support claim.

Auth-owned scoped delegation is separately selected. A delegated child uses the
explicit bearer transport with exact task, Agent session and caller bindings;
it cannot enter the browser, human approval or PAT surfaces. The neutral
Management service still checks current credential ceilings, qualification and
RBAC for each operation. Owner delegation receipts record credential issuance;
Management operation audit records remain with the selected Audit owner.

MCP tool names bind the entry ID, version, Capability, operation, target instance,
canonical input schema, effect and approval requirement. They use a bounded
SHA-256 fingerprint and exclude explanatory descriptions. Every call compares
the cached name against the freshly authorized catalog; an executable definition
change rejects the old name before dispatch. Formatting or object-key order in
the same schema does not change its identity.
