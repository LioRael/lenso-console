# Lenso UI implementation standard

Applies to Console pages and plugins rendered inside Console. This is the starting point for new pages, UI changes, generated prototypes intended for integration, and visual fixes. The target is a usable first implementation consistent with the installed Lenso design system.

## Before editing

1. Identify the page's job, primary action, navigation scope, and real data/permission states. Write a short implementation note in the task; do not invent unavailable features to fill a sidebar.
2. Inspect one approved sibling page in the running Console and its source. Use the same viewport and theme for comparison. The existing Agent and Settings shells are the reference for navigation and density; an external reference informs information hierarchy, not replacement controls.
3. Read [component reuse](components.md) and [geometry and states](geometry.md). Locate the installed component API and a real usage before writing markup. Record a small mapping: UI role → existing component/composition → source. Record any missing capability and its intended owner.
4. Name the alignment anchors: sidebar labels, page title, content text, row text, trailing actions. Identify which element owns each separator. Reuse the reference page's tokens and dimensions; avoid a new scale for each page.

Ready to implement means the shell, component choices, anchors, and states are known. A screenshot alone does not establish behavior or backend contracts.

## Implement

- Compose existing Lenso primitives and existing product compositions first. Keep business state in its owner; let Console own its shell and global navigation.
- Implement normal, loading, empty, error, permission-denied, long-content, and keyboard states together for the surfaces being changed. Preserve drafts and useful previous content when a refresh fails.
- Review a real rendered slice early: header + one section + one interactive row. Correct its density and alignment before repeating it across the page.
- Change the authoritative style rather than appending another override block for every revision. When multiple pages need the same adjustment, fix their shared composition or the UI component owner.
- A prototype is complete only as a prototype. Integration must use real components, routing, permissions, and data; re-review after integration.

## Acceptance before presenting as complete

Use [the review template](review-template.md). Each affected rule is pass, fail, or not applicable with a reason. A test pass alone is not a visual review.

Required evidence is an actual rendered page at the normal desktop size and a narrow supported size, plus the changed control in hover and keyboard focus. Check both themes where the surface supports them. Compare text anchors and hover bounds, not only the overall screenshot. Record exact routes, viewport, theme, data source, and remaining limits.

Fix visible defects in the changed surface before claiming completion. If a browser, account, or fixture prevents a check, report that check as unverified and describe the blocker. Never label a screenshot or mock fixture as live backend validation.

## Maintain this standard

Keep principles here and implementation details in their owning source. Component paths in `components.md` are discovery starting points, not a promise that every old use is compliant.

When a user identifies a recurring defect:

1. Reproduce it and identify its owner (token, primitive, shared composition, or page).
2. Correct the owner and inspect its other affected consumers.
3. Add or refine one rule in the relevant document, including a failing example and an observable acceptance criterion.
4. Add a focused geometry/interaction regression when it protects a recurring failure. Do not create a second rule document for the same concept.
5. Record any intentional exception with reason, affected consumers, owner, and removal condition in the change's review note. Exceptions need not interrupt already-authorized work.

These documents define the first-version quality gate. They reduce variation through component reuse and verification; they do not substitute for looking at the rendered result.

## Review example

[Projects alignment review](reviews/2026-09-12-projects-alignment.md) records measured geometry, fixture versus live coverage, and remaining limits. Use it as a reporting example, not as evidence for a later change.
