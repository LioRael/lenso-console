# CSS Reset and StyleX Boundary Findings

> Research date: 2026-08-08 (Asia/Shanghai)
> Scope: the reset and global-style ownership in `lenso-console`.
> Source policy: external claims use only official StyleX documentation/repository, CSS specifications or MDN, and browser documentation. No third-party reset recommendation was used.

## Decision

The recommended reset design is now implemented: keep a handwritten reset, make it small, and split document ownership into explicit cascade layers. Do not add Normalize.css, modern-css-reset, or another reset dependency.

The reason is ownership: this is not a generic browser-normalization problem. The Console reset already contains product decisions about tokens, typography, controls, focus, and motion. A library would add another global owner and make the interaction with StyleX harder to audit. MDN also notes that normalization stylesheets are less important than they once were because browsers are more consistent, while a small targeted form reset is still useful ([MDN form reset](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Images_media_forms#putting_it_all_together_into_a_reset)).

The implemented baseline is:

```text
console-reset  ->  console-base  ->  StyleX priority layers  ->  Host page contracts
```

The reset and document baseline are named `console-reset` and `console-base` layers, and the StyleX priority layers are declared after them. The existing Host page contracts remain unlayered for now because Module and Theme stylesheets are external stylesheet inputs whose current cascade and insertion order must be validated before moving page geometry into a named layer. This is an explicit compatibility boundary, not a reason to put component styles in a global catalog. Normal unlayered declarations outrank declarations in named layers ([MDN `@layer`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@layer)). StyleX's unplugin supports placing a reset/base layer before its generated priority layers and a page/utility layer after them ([StyleX unplugin](https://stylexjs.com/docs/api/configuration/unplugin#options-shared)).

## Repository audit

The reset ownership is now split into a mechanical reset, a document baseline, and Host page contracts:

| Owner                                                | Current responsibility                                                                                                                                              | Finding                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/styles-reset.css`](../../src/styles-reset.css) | Small `console-reset` layer for box sizing, viewport margins, media sizing, and `[hidden]`                                                                          | Mechanical browser baseline only; it does not own product typography, semantic spacing, or component interaction states.                                                                                                                                                                                                                                           |
| [`src/styles-base.css`](../../src/styles-base.css)   | `console-base` layer for document typography, semantic/native defaults, control-chrome neutralization, selection, and narrowly scoped fallback focus/caret behavior | The document contract is separate from the mechanical reset. Existing semantic defaults are retained because current Host markup uses raw headings, paragraphs, lists, tables, and native controls. The zero-width control border and zero-padding baseline preserve the visual contract of migrated StyleX utility surfaces that were authored against Preflight. |
| [`src/styles.css`](../../src/styles.css)             | Token imports, Host page geometry, and the existing reduced-motion fallback                                                                                         | Page contracts intentionally retain their current unlayered priority until Module/Theme stylesheet ordering is validated for a future `console-page` layer. They are no longer mixed with the reset/base rules.                                                                                                                                                    |
| `src/app/global-styles.ts`                           | Removed                                                                                                                                                             | The duplicate runtime StyleX owner no longer exists; document baseline styles are loaded as CSS before the client runtime.                                                                                                                                                                                                                                         |

The token stylesheet already owns the root color scheme and document font variables in [`packages/console-ui/tokens.css`](../../packages/console-ui/tokens.css). Component files also own their own `:focus-visible` and reduced-motion rules through StyleX. These should not be reimplemented by a second global selector unless the rule is intentionally a document or legacy-surface contract.

## Recommended ownership model

### `console-reset`: mechanical browser baseline only

The implemented layer keeps only rules that make the Console's layout model predictable:

- `box-sizing` convention;
- `html`/`body` margin and viewport baseline;
- a deliberately scoped media baseline;
- the `[hidden]` behavior required by the document shell.

Do not use this layer for page geometry, component variants, theme values, or interaction states. The repository's semantic and native defaults live in `console-base` because the existing Host markup depends on them; this is a compatibility choice, not an invitation to add more global component styling.

### `console-base`: document and theme contract

The implemented layer keeps `html` and `body` typography/background contracts, selection, semantic defaults needed by current raw markup, and native form/table/summary baselines here. The token stylesheet remains the owner of token values; the reset/base consumes those variables rather than defining a second token map. The old runtime `html`/`body`/`#root` StyleX classes were removed because they duplicated this CSS ownership.

`line-height: 1.5` is a reasonable document baseline because unitless values scale with the element's own font size and are generally preferred for inheritance ([MDN `line-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/line-height)). Component-specific compact line-heights should remain in StyleX.

Do not use `font: inherit` casually as a replacement for all typography declarations. The `font` shorthand resets unspecified font longhands and also resets properties such as `font-feature-settings` and `font-variation-settings` ([MDN `font`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font)). For controls, use the targeted inheritance rule and explicitly preserve any feature settings that are part of the Console typography contract.

The existing `color-scheme` declarations belong to the token/theme layer, not the reset. If the application supports both light and dark native-control rendering, keep the root declaration synchronized with the active theme. MDN recommends declaring `color-scheme` on `:root` and optionally providing the matching `meta` declaration early in `<head>` to reduce color flashes ([MDN `color-scheme`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme)).

### StyleX layers: component-owned behavior

Use StyleX for rules attached to a component's DOM owner: base geometry, variants, hover, disabled, focus, component typography, media queries, and animations. StyleX explicitly favors co-location and says styles should be caused by class names on the element itself; it does not allow arbitrary styling at a distance ([Thinking in StyleX](https://stylexjs.com/docs/learn/thinking-in-stylex/#co-location), [Encapsulation](https://stylexjs.com/docs/learn/thinking-in-stylex/#encapsulation)).

That means a browser reset should not be moved into a giant `globalStyles` object just to make it “StyleX.” Document selectors and universal selectors are global CSS concerns. StyleX's `defineVars`/themes are appropriate for token values and theme overrides, not for replacing the browser reset ([StyleX variables](https://stylexjs.com/docs/learn/theming/defining-variables), [StyleX themes](https://stylexjs.com/docs/learn/theming/creating-themes)).

### `console-page`: Host page contracts

Keep selectors such as `data-page` and `data-page-slot` here when they express page-owned viewport, scrolling, sticky-header, or workbench geometry. They are not reusable component defaults. This layer should be explicit and small; it should not become a replacement for component-local StyleX.

## Property-level findings

### Box sizing

Keep a single `border-box` convention, but define it once. `box-sizing` is not inherited; `border-box` includes padding and borders in the declared width/height and is generally easier for layout sizing ([MDN `box-sizing`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-sizing)). The project can use either a universal rule or an inherited `html` plus descendant convention; the important point is to remove the duplicate `#root`/`body` declarations and document the portal/third-party scope.

Do not combine box sizing with universal `margin`, `padding`, and `border` resets. Those are separate policy choices. In particular, `border: 0 solid` on every element removes the browser's native border baseline from controls and embeds more behavior into the reset than the box model requires.

The migration exposed one historical dependency on that universal border rule:
several local StyleX utilities declared only `border*Width` and expected the
reset to supply `solid`. Those authored borders now declare the corresponding
`border*Style` themselves, and a repository-boundary test prevents the hidden
dependency from returning. This restores page dividers without reintroducing a
global border policy or changing native control chrome.

### Form controls

Retain a targeted baseline for `button`, `input`, `select`, and `textarea`: inherited font family/size, a consistent box-sizing model, and explicit margins/padding where the Console's controls need them. This matches MDN's focused form-reset guidance ([MDN form styling](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Styling_web_forms)).

The preferred end state is for every custom control primitive to own its complete appearance. However, the current Host also contains raw buttons and inputs whose StyleX utility declarations were migrated from code that depended on Preflight. Removing the inherited `border: 0 solid`, zero padding, transparent background, and zero radius exposes browser `outset`/`inset` control chrome and causes a large visual regression. `console-base` therefore retains those specific neutralization rules as a tested compatibility baseline. New components must not rely on additional implicit control styling, and this baseline can shrink only after the remaining raw controls become self-contained.

Do not globally force `appearance: none` across every control. Native widgets have platform-specific behavior; `appearance: none` removes native styling and can make a widget disappear while leaving it interactive ([MDN `appearance`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/appearance)). Apply custom appearance only in the StyleX primitive that also supplies the replacement affordance, especially for `select`, checkbox, radio, and file controls. Placeholder styling, caret color, resize behavior, and cursor behavior should likewise be component-owned unless they are a deliberate document contract.

### Focus

Keep visible keyboard focus. Use `:focus-visible` in the StyleX primitive that owns the interactive element; it follows the user agent's focus-visibility heuristics while allowing a custom indicator ([MDN `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:focus-visible)). Never remove the outline without providing an equivalent visible indicator in the same ownership layer.

The base layer now provides only a neutral `:focus-visible` fallback for otherwise unstyled native controls and links. Component-specific focus colors, borders, and geometry remain in StyleX and are emitted in later priority layers. This fallback is intentionally generic and can be removed as remaining legacy surfaces become component-owned.

### Reduced motion

Do not use a blanket `*, *::before, *::after { animation: none !important; transition: none !important; }` rule as the primary policy. `prefers-reduced-motion: reduce` communicates that non-essential motion should be reduced or replaced; it does not require every transition in the document to be erased ([MDN `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)).

Put the reduced-motion branch beside each StyleX animation or transition. Prefer a reduced duration, opacity/transform alternative, or no animation for that specific component. Keep a global fallback only if it is explicitly scoped to an unknown legacy/vendor surface; do not let it override first-party component decisions with `!important`.

### Typography and semantic defaults

Set the document font family and a unitless base line-height once. Avoid globally zeroing heading/paragraph/list margins and list markers unless the entire document is intentionally a UI-only surface. In this repository, semantic defaults are safer in the component/feature that owns the markup, while the Host base layer owns only the document typography contract.

## Final recommendation

The best reset for this repository is **small handwritten CSS plus explicit reset/base layers**, not a reset library and not a StyleX global-style catalog. The implementation now follows that boundary:

1. `src/styles-reset.css` owns mechanical browser assumptions; `src/styles-base.css` owns the document and native baseline; `src/styles.css` owns Host page contracts.
2. Token values and `color-scheme` remain in the token/theme contract.
3. Component-specific focus, form appearance, placeholder, cursor, resize, animation, and reduced-motion behavior should continue moving to the owning StyleX component as each legacy surface is touched. The current native-control neutralization, generic focus fallback, and reduced-motion fallback remain deliberate compatibility policies covered by browser validation.
4. Page geometry should move into a small named `console-page` layer only after Module/Theme stylesheet insertion and cascade behavior have been verified. This was intentionally not bundled into the reset change.
5. StyleX's generated priority layers are configured after `console-reset` and `console-base`; component styles are not aggregated into a `styles.ts`/global-style catalog.
6. If a future reset is scoped to `#root`, verify portals, dialogs, and Module Surface mount points first. Keep `:host` only in a stylesheet that is actually adopted by a shadow root; it is not a substitute for ordinary document scoping.

This preserves the native browser behavior that the application does not own, gives StyleX a clear component boundary, and removes the current three-way reset ownership without adding another dependency.

## Primary sources

- [StyleX: Thinking in StyleX](https://stylexjs.com/docs/learn/thinking-in-stylex/)
- [StyleX: Defining styles](https://stylexjs.com/docs/learn/styling-ui/defining-styles)
- [StyleX: Variables](https://stylexjs.com/docs/learn/theming/defining-variables)
- [StyleX: Creating themes](https://stylexjs.com/docs/learn/theming/creating-themes)
- [StyleX: `@stylexjs/unplugin`](https://stylexjs.com/docs/api/configuration/unplugin)
- [StyleX runtime README](https://github.com/facebook/stylex/blob/main/packages/@stylexjs/stylex/README.md)
- [MDN: form reset and normalization](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Images_media_forms#putting_it_all_together_into_a_reset)
- [MDN: form styling](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Styling_web_forms)
- [MDN: `box-sizing`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-sizing)
- [MDN: `appearance`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/appearance)
- [MDN: `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:focus-visible)
- [MDN: `@layer`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@layer)
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
- [MDN: `font`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font)
- [MDN: `line-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/line-height)
- [MDN: `color-scheme`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme)
