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
