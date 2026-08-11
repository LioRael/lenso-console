# @lenso/console-ui

## 1.0.0

### Major Changes

- ada8c12: Retire generic Console administration contracts and require Module-owned
  Business API operations for Console data and cross-Module actions.

### Minor Changes

- 24f3b56: Expose the public System Connection projection used to compose Console Module
  Surfaces from an exact System topology and Management Binding.
- ce78ac7: Expose typed workload observations, asynchronous operations, and stable Workload
  References through the Console Host API and Services inspector.
- 9dfd4be: Remove server-only Managed Service target origins from the public service model
  and scope dynamically composed Module capabilities to the exact connected
  Service authority.
- 508cdc7: Add the digest-bound Console Surface Gateway contract and Support Ticket Module
  Surface for typed list, create, update, and close operations.

### Patch Changes

- 9dfd4be: Share the Console client React Context across independently bundled Console UI
  copies while keeping each client value scoped to its Provider tree.
- Updated dependencies [ce78ac7]
- Updated dependencies [ada8c12]
- Updated dependencies [508cdc7]
  - @lenso/console-module-api@1.0.0

## 0.2.1

### Patch Changes

- Updated dependencies [ab1370b]
  - @lenso/console-module-api@0.2.0

## 0.2.0

### Minor Changes

- 1c2cc9d: Release the current Console module and UI contracts together with the Console Service image.

### Patch Changes

- Updated dependencies [1c2cc9d]
  - @lenso/console-module-api@0.1.1
