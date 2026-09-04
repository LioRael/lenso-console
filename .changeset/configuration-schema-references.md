---
"@lenso/console-web": minor
---

Render locally referenced and nullable configuration schemas in Fields, retaining Advanced editing for unresolved or recursive references. Nullable fields edit the concrete value without inventing a TOML null representation.

Add explicit oneOf/anyOf form selection using Lenso UI. Selecting a variant writes only required constants and preserves other configuration fields; protected and unsupported variants remain in Advanced.
