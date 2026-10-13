# Validation

## Public contract

Verify every imported callable against `packages/console-react/src/index.ts` and the referenced source export. Check package exports and the actual runtime host from [runtime support](runtime-support.md); a successful typecheck does not prove that a host consumes a contribution.

When a host overrides package JS to a compiled entry, pair its stylesheet with
that build too. Source export conditions may legitimately resolve an empty CSS
entry that relies on source StyleX extraction. Prove mixed-resolution fixes in a
fresh browser/server, not only a warm preview or an artifact file inspection.

Use the target package's existing typecheck script/config. For standalone recipe checks, extract each complete TSX block to a scratch directory and typecheck it against the actual public package, React types and existing compiler options. A workspace source path mapping may resolve the public module during checks; keep example imports public. Do not invent ambient declarations to make an unavailable API compile. If dependencies or built declarations are absent, report the blocked check.

## Behavioral checks

Before adding a test, name the failure it prevents and why existing coverage misses it. Update the existing focused proof instead of duplicating it:

- **Scope:** change activation/unmount; retained setters and action/command/return callbacks cannot affect the next page. Closed page-context getters fail. Replacing a contribution cannot be undone by stale cleanup. Consult the layout fixture/tests and `packages/console-react/test/browser/fixture.tsx` / `console-shell.browser.test.ts`.
- **Execution:** confirmation receives the captured target set; repeated invocation cannot duplicate execution; late results cannot write into a retired activation; failure retains or explicitly reconciles selection; running exit/navigation follows real guards. Use the page's existing workflow tests, not a prop-forwarding test of the projection adapter.
- **Public types:** use `packages/console-react/test/composition.types.tsx` for local composition contracts and the compiler fixtures in `packages/console-authoring/compiler/test/compiler.test.mjs` for compiled module exposure. Do not assume the compiled fixture proves Command/Context Bar rendering.

## Real browser, when UI changes

Record a walkthrough in the actual target host, not just a local-Shell fixture for an admitted plugin:

- Invoke the changed controls, exercise empty/error/running states and dismiss the innermost overlay first. Verify late scope changes and pointer-down/up retirement cannot invoke a different action.
- Check one focused accessibility proof (names, disabled/running semantics, tooltip on hover/focus), keyboard proof (reachability, invocation, dismissal, restoration), and geometry proof (themes, narrow viewport, content-end and focus clearance). Merge overlapping coverage.
- Check contributed compact controls use SVG icons rather than text fallbacks.
  Sample whole hit targets near the Dock and viewport edges, including tooltip
  clipping and development-overlay obstruction. Await library focus guards and
  real settled resize geometry instead of arbitrary immediate DOM snapshots.
- For Command/Context Bar changes in a supported host, verify shortcut/search focus and restoration, fallback versus hidden/tabs/object, explicit return, modified tab clicks, and selection/page-state preservation while Command is open. Use keyboard and reduced motion as well as pointer input.

Reuse Lenso UI and StyleX sources of truth; inspect actual compiled visible states where styles change. Page work does not retest every Shell preset or motion variant unless it changes that contract.
For Dashboard-specific layout and pointer proofs, follow
[widget presentation](../../console-dashboard-widgets/references/presentation.md).

Handoff: list changed files, supported host, checks actually run, browser evidence for real UI changes, and remaining assumptions/gaps. Documentation-only edits need link/export/example checks, not a gratuitous browser run.
