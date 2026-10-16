---
"@lenso/console-sdk": patch
---

Count scrolling inside nested panes as session activity by capturing non-bubbling scroll events, and remove the matching capture listener during cleanup. Preserve existing idle and absolute deadlines, foreground restrictions, and authoritative session checks.

Regression coverage verifies nested-scroll renewal, cleanup, foreground recovery, shared-cookie rotation under browser locks, persistent-cookie browser restart, and rejection after logout, revocation, or expiry.
