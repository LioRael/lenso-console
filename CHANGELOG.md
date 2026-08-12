## @lenso/console-web@0.1.7

## 1.0.7

### Patch Changes

- 2c7043a: Expose complete, partial, disabled, and unavailable execution-log coverage in Story Inspector, including source gaps and actionable empty states.
- 2c7043a: Restore Story Inspector payload, log, and technical-operation evidence through Story-owned, correlation-scoped endpoints with membership validation and recursive sensitive-data redaction.

## 1.0.6

### Patch Changes

- 950dbe3: Keep direct Module Surface links in a loading or unavailable state until the connected System's Managed Service Context has been resolved. Console now defers loading the surface artifact until that authority context is known.

  Publish the Console Service image for both AMD64 and ARM64 so local development can use the native architecture instead of emulation.

## 1.0.5

### Patch Changes

- 43e9055: Keep Console-owned Story and Services surfaces visible for connected Systems without requiring separately reconciled dynamic artifacts. Linked Module surfaces may now bind to an enrolled owner Service, so Auth requests keep targeting the Host even when another Service is selected.

## 1.0.4

### Patch Changes

- 9b5b635: Keep Modules without a runtime observation unmanaged instead of reporting a false connected state, and expose missing Auth or Story Console UI artifacts as actionable Surface availability failures.

## 1.0.3

### Patch Changes

- 00d2f6d: Remove the Support Ticket business Surface from the Console host and standardize Console API errors on RFC 9457 Problem Details.

## 1.0.2

### Patch Changes

- c921e3f: Normalize OpenAPI operation method keys before selecting read or write Surface Gateway authorization.

## 1.0.1

### Patch Changes

- 866afd7: Bind Surface Gateway operations to exact runtime-provided OpenAPI artifacts and remove module-specific Business API adapters from the Console host.

## 1.0.0

### Major Changes

- ada8c12: Retire generic Console administration contracts and require Module-owned
  Business API operations for Console data and cross-Module actions.

### Patch Changes

- 24f3b56: Expose the public System Connection projection used to compose Console Module
  Surfaces from an exact System topology and Management Binding.
- 9dfd4be: Accept server-trusted signed Service enrollment receipts and require their exact
  identity, policy, and authenticated local Core binding before connecting a System.
- ce78ac7: Expose typed workload observations, asynchronous operations, and stable Workload
  References through the Console Host API and Services inspector.
- 9dfd4be: Project current-actor capabilities per Managed Service and keep Provider target
  origins server-only in Console Service responses.
- 9dfd4be: Expose explicit Console Surface unavailability reasons and prove the distinct
  Surface Grant and connected Module authorization boundaries.
- 508cdc7: Add the digest-bound Console Surface Gateway contract and Support Ticket Module
  Surface for typed list, create, update, and close operations.

## 0.1.9

### Patch Changes

- a6749bd: Allow the statically served TanStack Start bootstrap script through a
  content-hashed Content-Security-Policy so the Console Service can hydrate and
  authenticate in a real browser.

## 0.1.8

### Patch Changes

- 1c2cc9d: Release the current Console module and UI contracts together with the Console Service image.

### Fixes

Close the Console architecture migration by hosting only operator workflows,
loading Module UI artifacts in isolated frames through the digest-bound bridge,
and removing the retired same-origin Console package system.

## @lenso/console@0.1.6

### Features

Add an explicit `console.superadmin` authority marker that grants the current
Console operator access across the capabilities exposed by the Console Service.

### Fixes

Correct authenticated Console data routes and ignore failed duplicate module
registrations so Runtime Stories remains available when a disabled module is
also present in the registry.

## @lenso/console@0.1.5

### Features

Ship the redesigned operator workbench and the matching host-provided extension
components, theme tokens, workspace navigation, and light-mode contract.

### Fixes

Align Story inspectors and Module surfaces, expose grouped Auth workspaces in the
development host, and deduplicate admin-action evidence on Home.

## @lenso/console@0.1.4

### Fixes

Republish the Console package API with its built artifacts and advance the
Console Service OCI image to the matching immutable version.

## @lenso/console@0.1.3

### Features

Publish the independently operated Lenso Console Service with explicit Operator
bootstrap, password-authenticated sessions, governed OCI delivery, and the renamed
Console package API contract.

## @lenso/runtime-console@0.1.2

### Features

Publish the completed M6 delivery, extraction, Service, Story, and operations
surfaces as the reviewed Runtime Console artifact.
