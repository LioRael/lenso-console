# @lenso/console-react

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
