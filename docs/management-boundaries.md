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

This first profile admits only the session endpoint and explicitly selected
native Workspace paths. Shared Agent and Plugin control routes remain closed.
Existing loopback/local configuration remains explicit and unchanged; selecting
operators requires a deliberate configuration change and independent login.
The reference launcher still binds loopback and an HTTPS deployment still uses
the existing secure cookie, CSRF and origin controls.

C0 is reviewed and a bounded C1/C2 core is implemented. C3 has an explicit realm
trust/scoped Shell guard. A full C2 production adapter still needs credential
ceilings and revocation, deployment qualification, Approval/Audit ports and a
qualified target receipt path. C4-C6 and their UI/installation/real-client gates
are pending. The new Capability alone does not make the old local tools a
production management service.
