# Contextual defaults beyond tables

Use this reference to derive useful controls from the content's job, not to copy
a four-corner arrangement. The following is the skill's recommended combination,
not a shipped preset. Include only needed operations; explicit user customization
wins while targets, accessibility, content clearance and interaction stability
remain intact. Keep low-frequency actions in a suitable menu and field-specific
controls close to their content. Read [component decisions](component-decisions.md)
for real Form/Select/ComboBox/Accordion/Modal contracts and
[runtime support](runtime-support.md#contextual-design-capability-boundary) for
Shell primitives and gaps. Page state and service guards are not supplied by a
layout component.

| Scenario | Recommended default and reason | Exception / customization outlet |
| --- | --- | --- |
| Form or editor | A compact save/cancel group when changes are possible, with honest unsaved/running state; errors beside fields and form-level conflicts nearby. Keep the draft readable and preserve guarded navigation. | Read-only or autosaved content may need no commit group; cancel needs a real revert/exit meaning. User can choose inline/footer commit controls. Never add table queries or force a dirty-state preset. |
| Object detail | Identity and key facts first; return only to a real parent workflow, edit when supported, more for infrequent actions. Put dangerous low-frequency operations in a menu plus confirmation. | A direct entry may have no parent return. A frequent domain action can remain visible; user can choose inline actions. Avoid duplicate return if the Context Bar already provides it. |
| Charts / analysis | Group time range, dimensions and filters by query meaning. Global filters affect the named analysis; local chart context offers only chart-specific drilldown, zoom or export. | A small static chart may need no controls. Keep a global filter global while a chart is focused; switching charts cannot silently retarget it. User may pin a shared query panel or use labelled local controls. Automatic chart arbitration needs the same host extension as tables. |
| Logs / live monitoring | Search/time query group and follow/pause/latest navigation group when live data exists; expose follow state. Manual scrolling pauses following or otherwise preserves the reading position. | Deliberate update/retry is contextual here, not a generic refresh on every page. Static logs need no live controls; user may choose inline controls or default follow off. Never auto-jump while reading; state/service logic is page work, not a Console preset. |
| File cards / collections | Needed search/filter/view group; insertion separately; meaningful multi-selection defaults to smoothly transforming the existing supported host Dock into a bulk bar with count/target, valid operations and clear/cancel selection; clearing restores its previous navigation state with stable focus/targets. | A tiny collection may need no query controls. No table pagination assumption for cards; use actual paging/append capabilities. User can choose labelled view options and explicitly opt for local selection actions instead of Dock transformation. |
| Dashboard | Quiet browsing; explicit editing reveals add/arrange/save/cancel and relevant draft state. Content chooses density; do not populate corners with unused utilities. | Host/application permissions may make the Dashboard read-only. User chooses layout/presentation; Dashboard owns its draft/save contract, not Shell preferences. Existing Dashboard capabilities are not a generic page-edit preset. |
| Empty / error state | Explain the situation beside content with a relevant create or retry action when available; keep target and recovery result clear. | No create when unauthorized, no retry for a permanent condition. A monitoring-wide recovery can justify a contextual corner action; user may choose another accessible placement. Do not move a local error action into a corner merely for consistency. |

These examples share a decision rule: group controls with the same target and
purpose, then choose the least distracting reachable presentation. Corners help
persistent contextual actions; local errors, fields and small widgets usually
benefit from local controls. The table convention is specialized, not the layout
of every editor, chart or empty state. A customized placement never invents a
service operation or relaxes a confirmation/permission guard.
