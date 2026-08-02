---
packages:
  "@lenso/console": patch
---

### Features

Add an explicit `console.superadmin` authority marker that grants the current
Console operator access across the capabilities exposed by the Console Service.

### Fixes

Correct authenticated Console data routes and ignore failed duplicate module
registrations so Runtime Stories remains available when a disabled module is
also present in the registry.
