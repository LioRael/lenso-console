# @lenso/console

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
