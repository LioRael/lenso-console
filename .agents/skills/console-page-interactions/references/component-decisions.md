# Choose the actual Lenso component

Use this reference when a Console page adds or changes a business form,
selection, disclosure, list or dialog. Shell placement rules stay in
[presentation](presentation.md) and its canonical design-direction link;
do not copy corner/Dock/tab rules into component guides.

## Establish the consumer contract

Read the installed `@lenso/ui`, `@lenso/tokens` and `@base-ui/react` versions,
package `exports`, and relevant declarations. If a matching Lenso UI CLI/MCP
contract is available, use its metadata/API/examples as directed by the
`lenso-ui` skill. Otherwise identify the installed declarations and official
example used; current repository main is supporting evidence, not proof of an
older installed release. Never make an unavailable part compile with an ambient
declaration or silently install a new release.

The mappings below and [the isolated preview recipe](component-form-example.tsx)
were checked against UI/tokens **0.9.1** and Base UI **1.8.0**. Recheck in another
consumer; names alone are not contracts.

| User task | Existing public component / import | Parts and decision |
| --- | --- | --- |
| Submit a business draft, show server field errors | `Form` from `@lenso/ui/form` | `errors` keyed by field `name`; `onFormSubmit(values, details)` or native `onSubmit(event)`, not an invented submit API. Keep the existing CAS/preview/write handler. |
| Name, endpoint or exact decimal string | `TextField` from `@lenso/ui/textfield`; `Label`, `Input`, `Description`, `FieldError` from their `/label`, `/input`, `/description`, `/field-error` entries | TextField wraps Base UI Field.Root. Give it a stable `name`, compose label/control/description/error, and use required/validate as appropriate. Keep precise rates as strings, not number inputs. |
| A short finite choice: connection, protocol, directory format | `Select` from `@lenso/ui/select` | Root + Label + Trigger/Value/Indicator + Portal/Positioner/Popover/List/Item/ItemText/ItemIndicator. Controlled `value/onValueChange`, `items`, `name`, `required`; do not port a `selectedKey` API from another library. |
| Search many directory models | `ComboBox` from `@lenso/ui/combo-box` | Root + InputGroup/Input/Trigger/Indicator + Portal/Positioner/Popover/List/Item/Empty. Check `value/onValueChange` and `inputValue/onInputValueChange`; selection is not the query. Free-text unknown models need an explicit policy, not an invented `allowsCustomValue` prop. |
| Reveal optional directory tools, capabilities or cost sections | `Accordion` from `@lenso/ui/accordion` | Root/Item/Heading/Trigger/Indicator/Panel/Body. One item is sufficient for a single collapsible section; library indicator owns the chevron and keyboard state. |
| Compare records | `Table` from `@lenso/ui/table` | Use its real Content/Column/Row/Cell/ScrollContainer/Footer contracts; see presentation for list/detail composition. |
| Confirmation or contextual help | `Modal` from `@lenso/ui/modal` | Root/Portal/Backdrop/Viewport/Popup/Header/Title/Description/Body/Footer/Close; preserve Escape and focus restoration. Dialog is the behavior, not a guessed `@lenso/ui/dialog` import. |

In this release `@lenso/ui/field` and `@lenso/ui/collapsible` are not verified
exports. Use the supported TextField/Accordion composition. `Field.Root` from
`@base-ui/react/field` exists and appears in official Select examples; it is not
a Lenso `Field` export. Query a newer release before claiming new parts.

## Do not replace semantics with a blanket ban

Library controls may render native form/input/label/button/select elements.
Keep those semantics inside their implementations. Page headings, paragraphs,
sections and simple static documents also use ordinary HTML.

For an interactive business page, choose the supported family before building a
lookalike. A deliberate native `<select>` or `<details>` can still be appropriate
for a constrained fallback, simple document or absent API; record that reason
and verify the intended interaction. Styling a raw control does not inherit the
library's collection, field-error, portal or keyboard contract.

## Concrete failure to avoid

Relay's rejected configuration page imported Button/Input but used a raw
`<form>` with hand-composed `<label>`, raw `<select>` choices and a
`<details><summary>` directory entry. The triangle was the browser's disclosure
marker, not a handwritten character or a Lenso Indicator. Replacing colors and
moving buttons to corners did not fix this component gap.

For that workflow, first map the business form to Form/TextField/FieldError,
finite choices to Select, searchable model discovery to ComboBox, and optional
interactive sections to Accordion. Map backend issue paths to the exact field
names at the service adapter; keep non-field errors and conflicts in an honest
form-level message. Preserve controlled draft, local validation, preview
confirmation, synchronous duplicate-submit guard, running status and server
authorization. Form does not supply a CAS, price authority or permission grant.

## Read an official example, not just a component name

In `LioRael/lenso-ui`, use the matching-release files under
`apps/docs/src/demos/cn/`: `form/basic.tsx`, `textfield/with-error.tsx`,
`select/required.tsx` and its `required--select-example.tsx` helper,
`combo-box/default.tsx` and its helper, `accordion/controlled.tsx`, and
`modal/default.tsx`. Read referenced helper files. These are source-backed library
examples; their mock actions and unrelated fixture data are not business logic.
Installed type declarations remain the authority if source/example versions
differ. Do not copy a whole generic frontend tutorial into this skill.

## Minimal handoff

- State the task-to-component choice, exact release, API/example evidence and
  any justified native fallback.
- Typecheck the real public imports; exercise the primary interaction in the
  consuming host. Include invalid/server-error/running behavior when reached.
- Supply accepted screenshots at normal and narrow widths; check keyboard
  selection/disclosure, field error association, dialog dismissal/focus and
  settled theme/portal visibility as relevant. Reuse focused existing checks;
  no class-name snapshots or large CSS matrix.

The isolated preview recipe has no network, credential or production operation.
The caller supplies its activation signal and preview adapter; map backend
paths to its typed field keys and put unmapped issues in the form-level message.
The recipe cancels on retirement, ignores stale results and invalidates feedback
after edits. It demonstrates one finite choice and preview, not the complete
discovery/confirmation/save workflow. For ComboBox, keep query and selection
separate, bound rendered results with an honest count, preserve stable item
identity, and specify clearing and unknown-model behavior. Verify confirmation
against the previewed draft snapshot in the consuming page. This recipe is for
a future page repair, not evidence that Relay was fixed.
