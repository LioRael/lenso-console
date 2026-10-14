# Local composition and host preferences

Use this branch when the application supplies `ConsoleShell` with ordinary React
page definitions and typed clients. This is not directory compilation or a Core
runtime Plugin. Read the
[public composition types](../../../../packages/console-react/src/composition.ts)
and [package guide](../../../../packages/console-react/README.md).

## Define meaning, bind instances

1. Define the reusable page set with `defineConsolePlugin<Services>`. `pages`
   maps stable local IDs to components receiving `ConsoleLocalPageProps`.
2. Use `pageGroups` only for real same-workflow tabs. Declare a `defaultPage`,
   explicit tab pages, and `relatedPages` when a detail route should retain a
   list's active tab.
3. Declare explicit global `navigation` entries targeting a page or a group.
   Registering a detail route or tab does not automatically add it to the Dock.
   Give compact destinations an explicit SVG `icon`; `label` is the
   visible/accessibility name and `tooltip` is supplemental. Follow
   [presentation](presentation.md) instead of relying on a text fallback.
4. Create each installation with `bindConsole`: unique binding ID, explicit local
   routes, and the exact typed client/services for that installation.
5. Supply bindings to the existing Shell. The host router supplies matching,
   navigation, dirty/running guards, and history. Use page IDs through local
   `navigation.go`/`href`, not the SDK's segment-array calls.

**Done:** each route is unambiguous, each global item is intentional, and
independent bindings cannot share the wrong service client or mutable state.
`defaultPlacement` seeds user defaults; it does not force later pin changes.

### Icon and label are separate fields

For a local binding using the sample's installed icon set:

```tsx
import type { ConsoleNavigationDefinition } from "@lenso/console-react";
import { ShoppingBag } from "lucide-react";

export const ordersDestination = {
  id: "orders",
  page: "list",
  label: "Orders",
  tooltip: "Browse orders",
  icon: <ShoppingBag size={20} aria-hidden="true" />,
} satisfies ConsoleNavigationDefinition;
```

`list` must exist in the definition's `pages`; use `group` instead of `page`
when targeting a declared page group. Keep the readable label for the directory;
the compact Dock renders the SVG. Compiled descriptors have a different icon
boundary, described in [presentation](presentation.md).

## Host boundaries

The host selects `basePath`; binding paths are relative to it. Let the Shell
base-qualify generated links. Do not manually prefix paths again.

The session adapter supplies trusted `state` and `scopeKey`. Change the scope
when subject, target, or relevant permissions change; `canAccess` is only a UI
projection. Page async work checks its own activation and signal.

Page groups are fallback task context. For deliberate page-level hidden, tabs,
or object context, use the supported `ConsolePageScope` recipe rather than
rebuilding the top navigation. Corners can hold necessary persistent page
controls; local controls stay near content when useful. The host chooses layout,
clearance, focus, and transitions.

Use [the composed sample](../../../../examples/composed-console/composition.tsx)
for multi-binding structure and existing optional adapters. Its sample clients
are not evidence of production access policy.

## Preferences are host-owned

Only reach this section when changing host preference integration, not adding
a plugin destination:

- Bind `ConsolePreferenceStore` to the trusted user/application scope.
- `null` means no saved choice; `pinned: []` deliberately chooses none.
- Store stable binding/navigation references and bounded presentation data, not
  components, callbacks, credentials, or permission facts.
- Preserve unavailable references without exposing their labels.
- Save against `expectedRevision`; retain drafts after conflicts.
- Current Dock presets store user-defined collections. Position and Dock/sidebar
  mode are global presentation choices; selection is transient page state.

The [preference implementation](../../../../packages/console-react/src/console-preferences.ts)
owns validation, legacy migration, and the active-preset projection. Consult it
when integrating a store; a plugin should not maintain a second preference
document or mutate Shell storage to present contextual actions.

**Done:** a changed preference never remounts the page, clears canonical state,
grants access, or overwrites a concurrent saved revision silently.
