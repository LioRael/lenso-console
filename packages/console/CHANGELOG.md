# @lenso/console

## 2.1.9

### Patch Changes

- Release the landed Console table controls and transactional filter editing, including the matching Shell, Auth administration and plugin manager integration.
- Updated dependencies
  - @lenso/console-sdk@1.2.2

## 2.1.8

### Patch Changes

- Align the exact Auth runtime to 0.5.4 for native-client OAuth consumers and preserve shared Auth error identities.

## 2.1.7

### Patch Changes

- Align the runtime Auth owner with managed session status support and avoid duplicate Auth error identities.

- Updated dependencies
  - @lenso/console-sdk@1.2.1

## 2.1.6

### Patch Changes

- b0a2292: Add optional Console-scoped identity, membership, role and personal-token
  administration using existing Auth, Authorization, API Keys, Manage and Audit
  services. Admit protected one-time credential delivery into compiled pages
  without caching secrets, and preserve safe audit references for uncertain
  management outcomes. Keep initialization explicit and agent operation exposure
  read-only.
- Updated dependencies [b0a2292]
  - @lenso/console-sdk@1.2.0

## 2.1.5

### Patch Changes

- Reuse a strict request-owned Auth scope for catalog and session reads, replay each operation policy before disclosure, and preserve guarded denial fallback.

## 2.1.4

### Patch Changes

- Allow explicitly eligible finite reads to share request-owned Auth read scopes, replay list/invoke policies, and verify fresh identity and permissions before disclosure. Preserve legacy paths for writes, streams, and older Auth integrations.
- Update @lenso/auth to 0.5.2.

## 2.1.3

### Patch Changes

- Allow trusted hosts to prepare synchronous read contexts before one fresh execution authorization phase. Check list and invoke policies independently while sharing evidence verification within that phase; preserve legacy bindings for writes, streams, mounts and older integrations.

## 2.1.2

### Patch Changes

- Updated dependencies
  - @lenso/console-sdk@1.1.1

## 2.1.1

### Patch Changes

- Updated dependencies [f23b059]
  - @lenso/console-sdk@1.1.0

## 2.1.0

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
  - @lenso/console-sdk@1.0.0

## 2.0.0

### Major Changes

- Publish the TypeScript Console plugin and Fetch service as the supported runtime.
  This replaces the native Host launcher and its platform binary dependencies.
  Applications explicitly supply authentication, service targets, pages and their
  listener. The zero-business-page React Shell and domain adapters remain separate
  opt-in packages. Use the matching published Console SDK 0.3.0.

## 1.6.0

### Minor Changes

- c30967b: Add optional scoped Audit, Authorization, API Key, Tasks, Scheduler and Limits backend integrations using host-owned services and explicit Manage selections. Keep credential issue/rotation on separate protected no-store routes, default unsafe actions closed, and preserve trusted error classification and cancellation across pending request-body reads.

  Expose bounded retry estimates through workspace errors and add an explicit protected credential channel. Preserve application-selected page contracts, authoring compilation and scoped reads; remove the previous built-in management pages and their factory. These changes remain a private Console candidate; native runtime assemblies are retired and no registry replacement is claimed.

### Patch Changes

- Updated dependencies [559d0ad]
- Updated dependencies [559d0ad]
- Updated dependencies [ced80f4]
- Updated dependencies [c30967b]
- Updated dependencies [559d0ad]
  - @lenso/console-sdk@0.3.0
