---
"@lenso/console-web": patch
---

Adopt the HeroUI-based UI and tokens 0.8.0, migrate Console controls and theme
references, and align the backend with Lenso revision
119b9af70b82816588c00c8bf812f7c62d1a18b5. Unify Cargo dependency resolution and
provide a high-level native Host example with real Console removal verification.

Refactor the Console chrome around the approved Pencil design with shared
two-level navigation, context header, history/address toolbar and page headings.
Use Lenso Button variants for sidebar items and pill icon actions, remove Plugin
detail breadcrumbs, and preserve responsive navigation, focus and route context.
