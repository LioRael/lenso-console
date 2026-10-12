# @lenso/auth-console

## 1.0.2

### Patch Changes

- Accept the compatible Console React 0.3 line while retaining support for 0.2.

## 1.0.1

### Patch Changes

- Build published Auth Console pages with the production React JSX runtime so production applications can render them without a consumer compatibility transform.

## 1.0.0

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

## 0.2.0

Replace the legacy lenso-auth-module distribution with the optional capability-driven Console adapter owned by lenso-console. Expose explicit realm-scoped Auth administration through server contracts and isolated React/browser entry points. Hosts retain authentication, authorization and audit ownership.
