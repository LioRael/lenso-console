---
"@lenso/console-web": patch
---

Load the Agent homepage only when selected, read session and login methods together,
and let the session boundary prepare language once before admitting content.
Cache public content-named Shell assets across visits while keeping session HTML
uncached and workspace asset admission unchanged.
Keep shared StyleX rules in one stylesheet so lazy pages cannot remove login styles.
Use the portable configuration schema dialect for workspace sources; Console's
canonical identifier, path and permission-field validation remains mandatory.
