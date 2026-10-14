# @lenso/console-dashboard

## 0.2.3

### Patch Changes

- Updated dependencies [2f56e2b]
  - @lenso/console-react@0.3.2

## 0.2.2

### Patch Changes

- Frontend release-cohort overview: refine Console page presentation and login with compact task context, accessible corner controls, and consistent semantic themes.

  - Center the login form, distinguish login methods only when needed, and preserve session recovery with readable light and dark states.
  - Improve Dashboard editing, pointer layout behavior, and contextual widget controls.
  - Render Auth session and subject pages with shared tables, selection actions, and explicit detail navigation.
  - Refine plugin inventory presentation and ship the updated Console Shell in the SDK.
  - Align the frontend build toolchain with Bun 1.4.3.

- Updated dependencies
  - @lenso/console-react@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [f23b059]
  - @lenso/console-react@0.3.0

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

### Patch Changes

- Updated dependencies [9f0e444]
  - @lenso/console-react@0.2.0
