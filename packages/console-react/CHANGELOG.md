# @lenso/console-react

## 0.3.3

### Patch Changes

- Keep page-tab keyboard focus rings visible within clipped Console islands.

## 0.3.2

### Patch Changes

- 2f56e2b: Keep Console page and contributed context tab labels free of browser-default
  link underlines without requiring a host-wide anchor reset. Preserve real
  hrefs, keyboard navigation and ordinary content link styling.

## 0.3.1

### Patch Changes

- Frontend release-cohort overview: refine Console page presentation and login with compact task context, accessible corner controls, and consistent semantic themes.

  - Center the login form, distinguish login methods only when needed, and preserve session recovery with readable light and dark states.
  - Improve Dashboard editing, pointer layout behavior, and contextual widget controls.
  - Render Auth session and subject pages with shared tables, selection actions, and explicit detail navigation.
  - Refine plugin inventory presentation and ship the updated Console Shell in the SDK.
  - Align the frontend build toolchain with Bun 1.4.3.

## 0.3.0

### Minor Changes

- f23b059: Expose a login-only stylesheet for hosts that defer the admitted workspace. Source
  consumers delegate both stylesheet entries to their StyleX compiler, avoiding a
  duplicate precompiled aggregate while retaining the existing full default sheet.

## 0.2.0

### Minor Changes

- 9f0e444: Delegate interactive authentication and session HTTP handling to the selected
  Auth instance. Add typed login UI/session admission, retain operation enforcement
  and stale-read retirement, and exercise the persistent local SQLite example.

  Use published Auth 0.5.0 for the interactive/http/browser contracts, including
  session-source provenance and non-destructive early renewal. Update the optional
  Auth Console and Dashboard adapters to the matching Auth peer range.
  Align Manage 0.5.2 and the published Audit, Authorization, ApiKeys and Scheduler
  companions with their Auth 0.5.0 peer requirements for clean archive consumers.
