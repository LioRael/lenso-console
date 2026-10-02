# Relay operator navigation: read-only boundary

Scope: read-only triage of the ordinary-account operator links reported in Relay's `routing-budget-native-1e6-closure.json` and `models-request-native-d85-closure.json`. Those receipts separately report successful page/service denial; this note does not reinterpret link visibility as backend authorization or repeat Native qualification.

At Console base `7e2ed879c67c4267c595d7e06a0de3c465a37228`:

- `PageMount.navigation.items` has only `label` and `path`. `console-shell.tsx` renders these static items. UI Contribution's navigation schema rejects additional properties, so Relay cannot currently declare a supported `visible` or `permission` field.
- `requirements.available` means service admission/availability. Console's administrator and workspace access fields are not Relay's operator permission result. Neither is a valid substitute for Relay permission discovery.
- An existing dynamic composition solves the presentation boundary: Page props include `chrome.Sidebar` (`page-contribution-outlet.tsx`), backed by `ContributionSidebar` / `WorkspaceSidebarSlot`. A workspace may supply its own navigation while preserving plugin providers and lifecycle. Unmount restores the static fallback. This is documented in `docs/console-page-contributions.md` under Optional context sidebar and covered by `workspace-sidebar-slot.browser.test.tsx`.

The smallest implementation belongs to Relay UI: use this supported sidebar slot, reuse its existing permission discovery results, and display operator items only when that discovery allows them. Keep unknown, denied and failed discovery states without operator entries. Preserve the existing static route registry and page/service authorization. Account/source changes must reset cached permission and abort stale discovery; use the existing workspace lifecycle signal. Do not hardcode Relay route rules in Shell or infer permission from Console administrator status.

The slot expects navigation content, not another sidebar frame or workspace identity. Reuse the existing Lenso/Console navigation composition. Before delivery, verify an ordinary account, a read-only operator and an operator in the actual Native cohort, including identity changes and a direct denied deep link.

Independently opened the supplied `console-routing-budget-20261002/native-browser/native-account-denied-routing.png`: Channels, Routing and Route budgets are visible in the sidebar; the page shows an operator identity error without routing data. Native qualification and service denial remain attributed to the supplied receipts; they were not rerun here.

No Shell, Relay UI, backend, realm, descriptor or permission source was changed by this triage. No new backend field or ACL architecture is needed for this boundary.
