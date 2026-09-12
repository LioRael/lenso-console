# Geometry and interaction details

The visible text grid and the interactive surface are separate geometries. Keep content aligned while giving controls comfortable hover and focus bounds.

## Alignment anchors

Choose anchors before spacing individual elements. Compare text glyph starts using DOM Range bounds where element padding would hide the difference; use element bounds for surfaces. A difference of more than 1 CSS px between intended equal anchors requires correction or a recorded optical reason.

- Sidebar workspace name and section labels share a text start. Add container inset and control padding when calculating it. Do not align outer button rectangles and assume their labels align.
- Page headings, descriptions, section labels, and the first text in related rows share the content start. Icons may occupy a deliberate leading column; establish that column consistently.
- Trailing actions share a right inset. Counts and dates use stable columns and tabular numerals where useful.
- Header title and actions are vertically centered as groups. A label with a description is one group; avoid independently centering each line.
- Inspect mixed CJK/Latin text, long names, icons, wrapped descriptions, and one-line/two-line states. Alignment must survive actual content.

Observed failure: Projects workspace name began at header inset 6 + trigger padding 6, while the section label began at content inset 12 + label padding 10. Correct the combined offset (22), not the apparent button width.

## Hover surfaces that extend beyond aligned text

For a full-width interactive row under a heading, keep row text on the heading's anchor. Give the row positive inline padding and an equal negative inline margin so its background extends into the content gutter:

```css
.related-row {
  display: flex;
  padding-block: 10px;
  padding-inline: 8px;
  margin-inline: -8px;
  border-radius: var(--radius-control);
}
```

This is a layout example, not a replacement for an existing shared row component. Use logical properties and the matching page/token scale. Ensure the parent gutter accommodates the extension, the parent does not clip hover/focus, and the auto-sized block does not also have `width: 100%` that causes overflow.

Failure A: `padding-inline: 0` keeps text aligned but leaves hover background touching text.
Failure B: positive padding alone indents the row label relative to its section heading.
Failure C: applying padding only on hover moves the content under the pointer.

Acceptance: the text anchor stays fixed in default, hover, focus, and selected states; the background extends beyond both content ends; the focus ring is visible; narrow viewports have no horizontal overflow. Apply padding in the resting state.

## Borders, hierarchy, and density

- Assign one owner to each shared boundary. When a header already separates itself, inspect the next container's top border and shadow before adding another line.
- A table header can have a bottom separator; framing it with both top and bottom borders is an explicit hierarchy decision, not a default.
- Match the reference's semantic border token and width. Inspect at normal browser zoom; do not stack translucent borders or shadows to approximate a line.
- Reuse the existing spacing scale and control variants. Compact means less unnecessary container space, not unreadable type or clipped hit areas.
- Keep related controls close and sections farther apart. Align content edges across header, toolbar, table, and empty state according to their declared anchors.
- Use cards only when the content is a distinct object/group that benefits from containment. Nesting borders, repeated page titles, oversized empty panels, and repeated action bars need a concrete purpose.

## States that must be designed

| State | Observable requirement |
| --- | --- |
| Default / hover / selected | Same geometry; semantic colors; selected and hover remain distinguishable |
| Keyboard focus | Visible, unclipped, sensible order; icon-only controls have names |
| Menu / tooltip / popover | Anchored to trigger, within viewport, above the correct surface; interacting inside does not close its parent |
| Loading / refresh | Stable layout; useful prior content retained when safe; operation progress belongs near the affected action |
| Empty / filtered empty | Explain the difference; provide a useful action or clear-filter control |
| Error / permission denied | Readable bounded message; appropriate recovery; no raw runtime dump or unauthorized stale data |
| Long / localized content | Truncation or wrapping is deliberate; critical information and controls remain reachable |
| Narrow viewport | No accidental horizontal scrolling; controls wrap or collapse by priority; background outsets and focus rings remain visible |
| Light / dark | Token-based surfaces, text, borders, hover, selected, disabled and overlays are all checked |

Menu animation, focus, hover and selected state must not shift text. Support reduced motion for added transitions. Preserve the design system's control accessibility and target sizing rather than shrinking internals to achieve density.
