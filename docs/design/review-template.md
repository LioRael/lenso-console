# UI review note template

Copy the relevant fields into the change's review note or task artifact. Keep evidence specific and mark unavailable checks as unverified. Do not copy old pass statements forward.

## Scope and reference

- Changed routes/components:
- Existing approved reference page and source:
- UI role → reused component/composition:
- New shared capability or intentional exception (owner, reason, removal condition):
- Live backend or isolated fixture data:

## Geometry

- Sidebar text anchors (workspace label / section label):
- Content anchors (heading / description / row text):
- Trailing actions and column alignment:
- Hover/focus bounds versus text bounds:
- Separator owner at each changed boundary:
- Default → hover → focus geometry stable:

## Rendered checks

For each: pass / fail / not applicable / unverified, with evidence or reason.

- Desktop route, viewport, theme, screenshot:
- Narrow route, viewport, screenshot, horizontal overflow:
- Light and dark:
- Hover and keyboard focus of changed controls:
- Long labels / localized text / wrapping:
- Loading / empty / filtered empty / failure / permission states affected by the change:
- Menus and overlays (position, clipping, focus return):
- Real navigation and data behavior:

## Verification and remaining work

- Focused checks run and actual result:
- Visual defects found and corrected:
- Remaining limits or deferred shared-component debt:
- Source/build/runtime version used for the check:

First-pass review fails when a changed surface has duplicated controls without an owner, mismatched text anchors, background touching text, shifting hover geometry, duplicate boundary lines, clipped overlays, or invented live-data claims. Fix those findings before presenting the implementation as complete.
