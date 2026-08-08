# StyleX Best Practices Research

> Research date: 2026-08-08 (Asia/Shanghai)
> Scope: StyleX style ownership, composition, variants, tokens and themes, conditional rules, static extraction, runtime boundaries, and the coexistence of StyleX with handwritten CSS in `lenso-console`.
> Source policy: external claims use only the official StyleX documentation and the official `facebook/stylex` repository and examples. No third-party tutorials or secondary summaries were used.

## Executive conclusions

1. A large `styles.ts` file is not automatically an anti-pattern. StyleX favors local reasoning and co-location, but it also says that one small file can be better than many tiny files because fragmented CSS assets can increase loading and style-recalculation costs. Split by component or feature ownership, reuse boundary, and public API—not by an arbitrary line count. See [Thinking in StyleX](https://stylexjs.com/docs/learn/thinking-in-stylex/).
2. The StyleX composition primitive is `stylex.props(...)`. Define named style objects with `stylex.create({...})`, then compose them left to right at the element that owns the DOM. Later styles win, and conditional `false`, `null`, and `undefined` values are ignored. Do not invent a CSS-Modules-style `composes` abstraction. See [Defining styles](https://stylexjs.com/docs/learn/styling-ui/defining-styles) and [Using styles](https://stylexjs.com/docs/learn/styling-ui/using-styles).
3. Keep themeable values and compile-time constants separate. `defineVars` creates overridable CSS custom properties; `defineConsts` inlines fixed build-time values; `createTheme` applies variable overrides to a root and its descendants. See [`defineVars`](https://stylexjs.com/docs/api/javascript/defineVars/), [`defineConsts`](https://stylexjs.com/docs/api/javascript/defineConsts/), and [`createTheme`](https://stylexjs.com/docs/api/javascript/createTheme/).
4. StyleX is primarily an ahead-of-time/static CSS compiler. Static declarations are extracted into CSS, while runtime work mainly merges compiled style objects. Dynamic values use runtime CSS variables and should be reserved for values that are genuinely unknown at build time. Prefer predefined states and variants whenever possible. See the [StyleX package README](https://github.com/facebook/stylex/blob/main/packages/@stylexjs/stylex) and [Dynamic styles](https://stylexjs.com/docs/learn/styling-ui/defining-styles#dynamic-styles).
5. For this repository, component-owned declarations should use StyleX; document reset, Host/page contracts, Module assets, and vendor CSS should remain in explicitly owned CSS layers. StyleX atomic classes are not a global-CSS isolation boundary: inheritance, specificity, `!important`, source order, and global selectors still need review. See [Thinking in StyleX — Encapsulation](https://stylexjs.com/docs/learn/thinking-in-stylex/) and [`docs/adr/0004`](../adr/0004-treat-module-global-styling-rules-as-guidance.md).

## 1. Repository context

The repository already contains [`docs/stylex-authoring.md`](../stylex-authoring.md), [`docs/stylex-migration-plan.md`](../stylex-migration-plan.md), and a StyleX-related ADR. Those files define project constraints and migration policy; they are not treated as primary sources for StyleX facts.

This research note is stored at:

`docs/research/stylex-best-practices.md`

The implementation described below preserves the existing visual contract while making ownership and build boundaries explicit.

## 2. Why `styles.ts` often becomes large

### 2.1 Valid reasons for a large style module

StyleX encourages local reasoning: when reading markup, the named style slots used by that markup should be easy to find. A single `stylex.create` call can naturally contain a component's base state, variants, responsive values, pseudo-classes, and animations.

Variants also increase the number of named slots. A button may reasonably have `base`, `primary`, `secondary`, `small`, `large`, `disabled`, and `iconOnly` slots. That is a semantic state model, not accidental duplication.

Source size is not the same as delivered CSS size. StyleX extracts atomic declarations and can reuse the same declaration across components. A 1,000-line source catalog does not imply a 1,000-line runtime stylesheet.

StyleX also warns against needless fragmentation. Multiple small CSS assets can cause additional loading and style recalculation work. The lesson is not “put every style in one file”; it is “use an ownership boundary instead of mechanically creating one file per rule.”

### 2.2 When one file is reasonable

Keep a `styles.ts` or a component-local `styles` object when most of the following are true:

- all slots belong to one DOM owner or one bounded feature;
- base styles, states, variants, pseudo-classes, and media conditions compose together;
- names are semantic (`root`, `label`, `selected`, `disabled`) rather than anonymous;
- tokens, document reset, and third-party overrides are not mixed into the same object;
- the `stylex.props` order is visible at the consumption site;
- changing the file does not create hidden cascade changes for unrelated components.

### 2.3 When to split

Split at ownership boundaries:

| Boundary | Recommended location | Reason |
| --- | --- | --- |
| Shared theme variables and fixed constants | `*.stylex.ts` token module | They are cross-component contracts, not DOM-owner styles. |
| An independent primitive with its own DOM owner | Component or component-directory style module | It keeps changes local and makes review easier. |
| Public reusable style slots | The public primitive's style surface | It separates component API from feature-only styles. |
| Independent feature regions | Feature-owned style module | Layout and interaction semantics remain bounded. |
| Reset, `@font-face`, document selectors, vendor assets | Explicit Host/CSS asset | Their owner is the document or external asset, not a component. |

Do not split merely because a style contains a pseudo-class, media query, or variant. Those are normal StyleX expressions. Conversely, do not create an ownerless project-wide catalog that mixes tokens, primitives, Host shell geometry, Module assets, and global overrides.

## 3. StyleX composition rules

### 3.1 Static, named style objects

StyleX style objects must remain statically analyzable so the compiler can extract them:

```tsx
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  root: { display: "flex" },
  primary: { backgroundColor: "blue" },
  disabled: { opacity: 0.5 },
});

<button
  {...stylex.props(
    styles.root,
    variant === "primary" && styles.primary,
    disabled && styles.disabled,
    props.style,
  )}
/>;
```

`stylex.props` accepts nested arrays and merges from left to right. Put the component's stable base first, then variants and states, and put a consumer-owned StyleX slot last when consumers are allowed to override the same property.

`null` can explicitly unset a previous property without creating an additional CSS rule. Use it only where the default branch needs to clear a composed value.

### 3.2 Composition is not CSS text inheritance

Cross-file composition still means importing a compiled style object and passing it to `stylex.props`. Avoid copying StyleX objects with JavaScript object spread or hiding cascade order in a declaration-level `composes` abstraction. The order should be visible where the element is rendered.

### 3.3 Variants

Define the allowed variant styles up front and select them by key. TypeScript can constrain the key with `keyof typeof`:

```tsx
const styles = stylex.create({
  base: { borderRadius: 8 },
  solid: { backgroundColor: "blue" },
  outline: { borderWidth: 1 },
  small: { padding: 4 },
  large: { padding: 12 },
});

const colors = { solid: styles.solid, outline: styles.outline };
const sizes = { small: styles.small, large: styles.large };

type Color = keyof typeof colors;
type Size = keyof typeof sizes;

stylex.props(styles.base, colors[color], sizes[size]);
```

Orthogonal properties should remain independently composable. Add a compound style map only when a combination has independent semantic meaning.

### 3.4 Tokens, constants, and themes

Use `defineConsts` for fixed values such as media-query strings, z-index levels, fixed animation timing, and values that never need theme substitution.

Use `defineVars` for color, spacing, typography, and other values that can change with theme, brand, tenant, or runtime context:

```ts
import * as stylex from "@stylexjs/stylex";

export const colors = stylex.defineVars({
  text: "#1f2937",
  surface: "#ffffff",
});
```

Use `createTheme(colors, overrides)` at the root where the theme applies. Component layout and interaction styles should remain with the component; a theme should override tokens, not become a second scattered component implementation.

### 3.5 Pseudo-classes, media queries, and cross-DOM state

Pseudo-classes and media queries belong in property condition objects with a `default` value:

```ts
const styles = stylex.create({
  button: {
    color: {
      default: "black",
      ":hover": "blue",
      ":active": "navy",
    },
  },
});
```

Prefer real child elements over pseudo-elements when that makes the DOM clearer and avoids extra CSS. Before introducing `@container` or another less common `@` rule, validate the exact compiler version, generated CSS, and target browser support with a minimal fixture.

StyleX generally avoids style-at-a-distance. Prefer props, state, context, or CSS variables. Use `stylex.when.*` and marker selectors only when the cross-DOM relationship is a real contract and the target browser supports the selector model.

### 3.6 Dynamic styles

Most conditional styles are still static:

```tsx
stylex.props(
  styles.base,
  variant === "danger" && styles.danger,
  isActive ? styles.active : null,
);
```

Use dynamic StyleX functions only when the value is unknown before runtime, such as a measured position, user-provided size, or data-driven scale. Runtime CSS variables have a cost and should not replace ordinary variants.

## 4. Extraction and runtime behavior

| Stage | StyleX behavior | Engineering consequence |
| --- | --- | --- |
| Compile | Babel or bundler plugins analyze `create`, `keyframes`, variables, and related APIs. | Keep style objects static and analyzable. |
| Bundle | The unplugin aggregates generated StyleX CSS into a CSS asset. | Treat the CSS asset as part of the package/build contract. |
| Browser | Static declarations are atomic classes/CSS rules. | Source catalog size does not equal runtime injection size. |
| Render | `stylex.props` merges compiled objects and returns element props. | Keep composition order at the render site. |
| Dynamic | Unknown values are passed through runtime CSS variables. | Use an allowlist for dynamic values. |

The official runtime intentionally treats uncompiled `create` and `defineVars` calls as compiler-protected operations. Production behavior depends on static extraction, not arbitrary browser-side CSS injection.

## 5. Handwritten CSS and StyleX boundaries

Prefer StyleX when a rule is owned by a React component, can be expressed through props/state/theme, and benefits from typed composition.

Retain handwritten CSS when a rule is owned by the document, Host shell, a third-party asset, or a Module asset; when it is a reset or font-face declaration; or when current StyleX/compiler/browser support has not been verified.

The important question is not “StyleX or CSS?” It is “who owns this rule, and is there exactly one authoritative implementation?” Atomic StyleX classes do not make duplicate parity CSS harmless.

### 5.1 Layers in this repository

1. **L0 document/global contract.** `src/styles-reset.css` and the document-level rules in `src/styles.css` own reset, form baseline, selection, focus, cursor, font, and reduced-motion behavior.
2. **L1 token/theme compatibility.** `packages/console-ui/tokens.css` and `packages/console-tokens/src/tokens.stylex.ts` provide the token boundary for StyleX and Host/theme consumers.
3. **L2 Host page contracts.** Page viewport, scrolling, sticky headers, workbench geometry, and page-specific layout remain Host-owned while the migration is validated.
4. **L3 page contract.** Host-owned page geometry and explicit `data-page`/`data-ui` markers remain in the document CSS layer. There is no project-wide utility-class bridge; component-owned declarations live beside their markup.

The former component parity stylesheet has now been removed. Component base, variant, focus, hover, disabled, and responsive rules are compiled from StyleX. Remaining page selectors are Host contracts and target explicit `data-ui` component slots where they need to refine a product layout.

## 6. Project audit evidence

The audit covered `src/`, `packages/`, StyleX/Vite configuration, CSS assets, documentation, `className`, `style`, and StyleX entry points.

| File or area | Observation | Ownership assessment |
| --- | --- | --- |
| `packages/console-ui/src/ui.tsx` | Console UI primitive markup and primitive-owned StyleX definitions are compiled together. | Co-located component owner; shared public slots are re-exported without a second definition file. |
| `packages/console-ui/src/ui.tsx` | Primitive markup, private implementation styles, and public named StyleX slot groups live in one compile unit. | Component ownership and the public slot boundary are visible together; there is no second style catalog. |
| `src/components/runtime/console-shell.tsx` and `src/app/console-status-styles.ts` | Host shell and lifecycle styles are owned by their Host implementation. | Private Host ownership; they are no longer exposed through the public UI catalog. |
| `src/styles.css` | Host reset, page contracts, and explicit `data-ui` slot refinements. | Keep document/page rules; do not add component base geometry here. |
| `packages/console-ui/components.css` | Deleted after the StyleX primitive CSS was verified by package, build, and browser gates. | No longer an alternate component implementation. |
| `packages/console-ui/tokens.css` | Stable CSS variables and Host aliases. | Compatibility layer; component layout does not belong here. |
| `src/styles-reset.css` | Document reset/preflight behavior. | Correct global CSS owner. |
| `packages/console-tokens/src/tokens.stylex.ts` | Typed generated variables and themes. | Correct token authority. |

The Vite chain already uses `@stylexjs/unplugin/vite` with CSS layers and static extraction. The refactor therefore addressed ownership drift, removed the compatibility bridge, and eliminated the two overlapping component CSS implementations.

## 7. Current implementation

The following changes are part of this refactor:

- `packages/console-ui/src/ui.tsx` now contains the primitive markup and the primitive-owned StyleX definitions in the same compile unit. This makes the component owner and its variants visible together.
- `packages/console-ui/src/ui.tsx` owns the primitive markup and its StyleX definitions. Its named groups (`pageStyles`, `controlStyles`, `dataStyles`, `layoutStyles`, `settingsStyles`, `formStyles`, and `tableStyles`) are re-exported directly for Module authors who intentionally need a public slot; there is no aggregate `styles` object.
- Host shell styles live in `src/components/runtime/console-shell.tsx`; shared Host lifecycle/recovery styles live in `src/app/console-status-styles.ts`. They are no longer accidentally published as Module UI slots.
- The former `mergeStyleProps`, `legacyClassNameProps`, `stylexClassName`, `src/lib/cn.ts`, and component parity stylesheet have been removed. Package primitives emit their `data-ui` markers directly and reject `className`/`style` passthrough at the type boundary.
- All Console-owned component and page call sites now use local `stylex.create` definitions and `stylex.props` directly. The old utility bridge was removed after its call sites were migrated; unknown third-party styling remains the third party's own asset boundary.
- Runtime geometry uses one inline-style owner when it must coordinate with imperative state. The Stories workbench keeps its static container rules in StyleX, while its measured grid columns and GSAP progress variable share one explicit inline object. This avoids both a custom merge helper and the JSX overwrite bug caused by combining a dynamic `stylex.props()` result with a second `style` prop.
- Relative TypeScript imports are authored without `.js` or `.ts` extensions. Published package builds use `ESNext`/`Bundler` resolution, then rewrite extensionless relative imports in `dist` to valid `.js` ESM specifiers. This keeps authoring ergonomic without publishing broken Node ESM.
- The Vite package configs use the explicit `runner` config loader so extensionless config imports remain supported without the native-loader warning.

The public named slot exports are optional API for Module authors, not a reason to aggregate every declaration. Consumers should import component primitives first and use a named group only when they intentionally need that extension boundary. Internal definitions remain owned by their components and features.

There is no remaining Console-wide utility bridge. Legacy utility-shaped call sites and the official Module Surfaces were migrated to file-local StyleX owners, then the bridge was deleted after package, application-build, unit, contract, and browser gates passed. New Console-owned code must continue to define local named StyleX slots.

## 8. Recommended target architecture

```text
packages/console-tokens/src/
  tokens.stylex.ts                    # defineVars / theme authority

packages/console-ui/src/
  ui.tsx                              # primitive markup, private styles, named public slots

src/
  styles-reset.css                    # L0 document reset
  styles.css                          # documented Host/page contracts and data-ui refinements
```

Co-location should be used when it improves local reasoning. Shared styles may stay in an ownership module when they serve several primitives or form a public package contract. The build should still produce one aggregated StyleX CSS asset; source ownership and CSS asset aggregation are separate concerns.

## 9. Review checklist

- [ ] Does this style object have one clear component or feature owner?
- [ ] Would co-locating it with the markup improve local reasoning?
- [ ] Is base/variant/state/consumer order visible in `stylex.props`?
- [ ] Are themeable values in `defineVars` and fixed values in `defineConsts`?
- [ ] Do pseudo-class and media values include a `default` branch?
- [ ] Is a pseudo-element or style-at-a-distance relationship really necessary?
- [ ] Is the dynamic value genuinely unknown until runtime?
- [ ] Has any non-`@media` rule been verified against the locked compiler and browser targets?
- [ ] Is this actually a Host/global/third-party rule that belongs in handwritten CSS?
- [ ] If StyleX and CSS coexist, were CSS entry order, layers, specificity, inheritance, focus, hover, responsive, and theme behavior checked?
- [ ] Does new Console-owned code use a local `stylex.create` owner and `stylex.props` at the DOM owner?
- [ ] If an inline runtime-style exception exists, is there exactly one inline-style owner, with no dynamic `stylex.props()` result that a later `style` prop can overwrite?
- [ ] Are package source imports extensionless while published ESM imports are explicit?

## 10. Primary sources

- [StyleX Introduction](https://stylexjs.com/docs/learn/)
- [Thinking in StyleX](https://stylexjs.com/docs/learn/thinking-in-stylex/)
- [Defining styles](https://stylexjs.com/docs/learn/styling-ui/defining-styles)
- [Using styles](https://stylexjs.com/docs/learn/styling-ui/using-styles)
- [Variants](https://stylexjs.com/docs/learn/recipes/variants)
- [Defining variables](https://stylexjs.com/docs/learn/theming/defining-variables)
- [Creating themes](https://stylexjs.com/docs/learn/theming/creating-themes)
- [Context-driven styles](https://stylexjs.com/docs/learn/recipes/context-driven-styles)
- [Variables for descendant styles](https://stylexjs.com/docs/learn/recipes/descendant-styles)
- [Static types](https://stylexjs.com/docs/learn/static-types)
- [`stylex.create`](https://stylexjs.com/docs/api/javascript/create/)
- [`stylex.props`](https://stylexjs.com/docs/api/javascript/props/)
- [`stylex.defineConsts`](https://stylexjs.com/docs/api/javascript/defineConsts/)
- [`stylex.defineVars`](https://stylexjs.com/docs/api/javascript/defineVars/)
- [`stylex.createTheme`](https://stylexjs.com/docs/api/javascript/createTheme/)
- [`stylex.when.*`](https://stylexjs.com/docs/api/javascript/when/)
- [`@stylexjs/unplugin`](https://stylexjs.com/docs/api/configuration/unplugin)
- [Official StyleX runtime package README](https://github.com/facebook/stylex/blob/main/packages/@stylexjs/stylex)
- [Official StyleX Babel plugin](https://github.com/facebook/stylex/blob/main/packages/@stylexjs/babel-plugin)
- [Official StyleX unplugin README](https://github.com/facebook/stylex/blob/main/packages/@stylexjs/unplugin/README.md)
- [Official Vite + React example](https://github.com/facebook/stylex/blob/main/examples/example-vite-react/README.md)
- [Official Vite example `App.tsx`](https://github.com/facebook/stylex/blob/main/examples/example-vite-react/src/App.tsx)
- [Official Webpack `CTAButton.jsx` example](https://github.com/facebook/stylex/blob/main/examples/example-webpack/src/components/CTAButton.jsx)
- [Official Webpack token example](https://github.com/facebook/stylex/blob/main/examples/example-webpack/src/tokens.stylex.js)
