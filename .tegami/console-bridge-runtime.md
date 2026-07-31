---
packages:
  "@lenso/console-bridge": patch
---

### Fixes

Publish the isolated Module UI bridge contract through the environment-bound
release runtime after the earlier ready event was rejected before dispatch.
