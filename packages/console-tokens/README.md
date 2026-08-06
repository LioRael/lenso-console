# @lenso/console-tokens

The generated, platform-neutral token contract shared by the Lenso Console
Host and Module Surface authors.

`tokens.json` is the DTCG-compatible source. The `@lenso/console-tokens`
JavaScript entry exports typed StyleX variables, official light/dark themes,
token names, and stable CSS custom-property names used by Theme Bundles. The
`legacyTokenCssVariables` map is available to Host integrations that still
render a global reset or page contract during a staged migration.
When consuming the precompiled package outside the Console build, load
`@lenso/console-tokens/stylex.css` once alongside the JavaScript entry.

```tsx
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@lenso/console-tokens/tokens.stylex";

const styles = stylex.create({
  panel: {
    backgroundColor: tokens.panel,
    color: tokens.foreground,
    padding: tokens.space3,
  },
});
```

Module Surfaces may use another styling system. In that case, prefer the
published `tokenNames`/`tokenCssVariables` metadata and keep overrides inside
the Surface Root. Shared-token and selector scoping rules are recommendations
for trusted third-party Modules; the Host owns global theme activation.

Theme Packages may override the stable `--lenso-token-*` variables for a
selected Theme Variant. Consumers should not depend on generated StyleX class
names or private Host layout selectors.
