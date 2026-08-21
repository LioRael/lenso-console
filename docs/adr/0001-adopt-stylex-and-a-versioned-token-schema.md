---
status: superseded by ADR-0006
---

# Adopt StyleX and a versioned token schema

Lenso Console will replace Tailwind and Console-owned component/utility styling
with StyleX. A DTCG-compatible, platform-independent JSON schema in the repository is
the authoritative token source; it generates the typed StyleX contract used by
the Host and offered to Module Surface authors, while the Host remains the sole
owner of the global theme.

The schema also generates stable CSS custom-property references and TypeScript
metadata for authors who use another styling system. These generated variables
are runtime theme values rather than a legacy stylesheet compatibility layer.

Module Surface authors are encouraged but not required to use StyleX. Their
independently built styling output must remain inside the Surface Root, and only
Surface-local Tokens may be introduced there. The migration intentionally makes
a breaking `consoleUi` major transition: existing CSS entry points and artifacts
built against them will not receive a compatibility layer and must be rebuilt.
The `consoleUi` major is the public compatibility gate; the token schema does not
introduce a second developer-facing version negotiation system.

The public contract continues to provide official React primitives. Their
generated class names and DOM structure remain private; customization is exposed
through named, typed style slots rather than unrestricted class-name passthrough.

The generated contract is published separately as `@lenso/console-tokens`.
`@lenso/console-ui` depends on it and publishes precompiled JavaScript, CSS
assets, types, and React primitives; `@lenso/console-module-api` remains free of
visual implementation. Console and Module builds use the official
`@stylexjs/unplugin` integration, while consumers of precompiled primitives do
not need a StyleX compiler.

## Considered Options

- Figma Variables as the token source were rejected because their reviewed state
  is harder to reproduce and audit from the repository.
- Bidirectional Figma and code synchronization was rejected because conflicts
  would have no deterministic authority.
- A legacy CSS compatibility period was rejected in favor of reaching a single
  styling contract without carrying two public systems.

## Consequences

StyleX-generated CSS remains a valid build output, and Tailwind plus the existing
public CSS entry points are removed. Host-only reset/page-contract CSS and a
temporary private parity layer remain explicit during visual equivalence
validation; neither is part of the public Module Surface API, and the parity
layer is retired after approval. Reference, semantic, and component tokens are
shared; Module-specific
meanings remain Surface-local. Host layout, breakpoint, density, and component
composition tokens remain private to ordinary Module Surfaces but are available
as Themeable Host Tokens to validated Theme Packages.

The migration supplies dark and light official Host Themes and implements the
Theme Bundle contract for additional official or third-party Theme Packages,
without granting a Module Surface authority to activate or globally mutate a theme.
Console administrators control which Theme Packages are available; each Operator
may choose a Host Theme, falling back to the instance default.

A Theme Package is the declarative portion of a Theme Bundle, with a manifest,
token overrides, compatible `consoleUi` major range, integrity digests, and
optional packaged fonts, icons, or images. Theme resources cannot reference
remote URLs. A theme that fails validation or becomes incompatible is not
partially combined with a new contract: activation falls back atomically to the
instance's official default theme and reports the failure to the Operator.

Use of shared visual tokens by a third-party Module Surface is recommended for
conformance but is not mandatory. Console-owned code and official primitives do
use the generated contract. Third-party artifacts remain subject to artifact
integrity and deterministic loading rules, while visual-token and selector
guidance is advisory.

Token catalogs, TypeScript types, Figma variable data, compatibility metadata,
and component catalogs are generated from the token schema and typed component
metadata. CI rejects stale generated outputs; only explanatory guidance and
example Surfaces are maintained by hand.

The migration preserves existing visual appearance and product behavior
strictly. A deliberate visual change is permitted only when correcting a
specific difference against the Approved Figma Frame under review.
