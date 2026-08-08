# ESM Library Bundling Findings

> Research date: 2026-08-08 (Asia/Shanghai)
> Scope: replacing the repository's custom post-build ESM extension rewrite with a library bundler.
> Source policy: external claims use official Node.js, TypeScript, Vite, Rolldown, tsdown, and StyleX sources only.

## Decision summary

The repository now uses `tsdown` as the single library build for all four public packages: `console-module-api`, `console-composition-api`, `console-tokens`, and `console-ui`. One build owns JavaScript, bundled declarations, and package assets, so the custom `scripts/rewrite-package-dist-imports.mjs` step is no longer needed.

This is the right boundary for native ESM packages. Node requires explicit file extensions for relative and absolute ESM specifiers; an internal module graph that is bundled into a single entry does not need a post-build extension rewrite. The declaration graph must be handled at the same time: TypeScript's guidance warns that a JavaScript build and a separately emitted extensionless `.d.ts` graph can disagree about the package's NodeNext-consumable shape. See [Node's mandatory ESM extension rule](https://nodejs.org/api/esm.html#mandatory-file-extensions) and [TypeScript's compiler-option guidance](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options).

`tsdown` is preferable to raw Rolldown here because it supplies library-oriented defaults, dependency handling, declaration bundling, and package-oriented configuration on top of Rolldown. The repository also verified the StyleX Rolldown adapter with the actual token and UI packages, so keeping Vite only for StyleX is no longer necessary for this codebase.

## Repository baseline and result

Before this change:

- `@lenso/console-module-api` and `@lenso/console-composition-api` ran `tsc`, then invoked the custom rewrite script.
- `@lenso/console-tokens` and `@lenso/console-ui` used Vite Library Mode for JavaScript and StyleX CSS, `tsc` for declarations, and the same rewrite script.
- Packages were native ESM and exposed `dist/*.js` and `dist/*.d.ts` through `exports`.

After this change:

- Each package has a `tsdown.config.ts` and its `build` script runs `pnpm clean && tsdown --config tsdown.config.ts`.
- API packages emit one bundled `dist/index.js` and one bundled `dist/index.d.ts`.
- `console-tokens` emits `index.js`, `index.d.ts`, `tokens.stylex.js`, `tokens.stylex.d.ts`, and its StyleX CSS asset.
- `console-ui` emits one bundled `index.js`, one bundled `index.d.ts`, and its StyleX CSS asset.
- `console-ui` externalizes React and the public console APIs while bundling its internal modules; its output has no relative internal imports.
- The source tree continues to use extensionless TypeScript import declarations. Explicit `.js` appears only where it is required in emitted ESM, such as the generated `index.js` importing the generated `tokens.stylex.js` entry.

The old rewrite script was compensating for two independent output graphs. The new build removes that split instead of trying to normalize it after the fact.

## Comparison

| Concern | Vite Library Mode | tsdown / Rolldown |
| --- | --- | --- |
| Primary role | Opinionated browser-oriented library build. Vite documents `build.lib`, external dependencies, ESM/CJS/UMD output, and package `exports`. See [Vite Library Mode](https://vite.dev/guide/build.html#library-mode). | `tsdown` is library-focused and built on Rolldown; Rolldown itself is a general-purpose bundler. See [tsdown's introduction](https://tsdown.dev/guide/) and [Rolldown's introduction](https://rolldown.rs/guide/introduction). |
| JavaScript | Bundles internal modules, so normal internal relative imports do not need a post-build extension pass. Externalized dependencies remain package imports. | Bundles internal modules and supports ESM/CJS formats. `unbundle: true` intentionally preserves a source-like file graph, so it would reintroduce the extension problem. See [tsdown unbundle mode](https://tsdown.dev/options/unbundle). |
| Declarations | Vite's official Library Mode documentation covers JS and CSS output, not `.d.ts` generation or declaration bundling. Keeping `tsc` as a separate declaration build preserves the old two-graph risk. | `tsdown` bundles declarations through its dts pipeline. See [tsdown declaration files](https://tsdown.dev/options/dts) and [DtsOptions](https://tsdown.dev/reference/api/Interface.DtsOptions). |
| CSS | Library CSS is emitted as a CSS asset and can be exported through `package.json`; `cssFileName` is supported. See [Vite CSS support for libraries](https://vite.dev/guide/build.html#css-support). | The repository uses the StyleX Rolldown adapter directly. The resulting builds emit `assets/stylex.css`, while the package exports and `sideEffects` contract remain unchanged. |
| StyleX | The pinned `@stylexjs/unplugin` integrates with Vite and can aggregate extracted StyleX rules into a CSS asset. See the [official StyleX unplugin package](https://www.npmjs.com/package/%40stylexjs/unplugin). | The same package exposes a Rolldown adapter. The actual `console-tokens` and `console-ui` builds now pass with that adapter, including token aliasing, CSS emission, and the existing package contract. |
| Package contract | Vite can preserve the existing `./stylex.css` export, but declarations still need a separate tool if the rewrite script is to disappear. | One config owns JavaScript, declarations, StyleX CSS, entry names, external dependencies, and output paths. This is the smallest complete replacement for the previous build chain. |

## StyleX-specific invariants

StyleX is a compile-time CSS system, not a runtime CSS injector. Its guidance favors a small aggregated stylesheet rather than many lazily loaded CSS files; see [Thinking in StyleX](https://stylexjs.com/docs/learn/thinking-in-stylex/#one-small-file-over-many-smaller-files). The migration preserves these invariants:

1. StyleX declarations are transformed before output.
2. Generated rules are collected into one deterministic CSS asset per package build.
3. `@lenso/console-ui/stylex.css` and `@lenso/console-tokens/stylex.css` continue to resolve to real files.
4. The CSS asset remains a side effect and is not tree-shaken away.
5. The token alias used by `console-ui` resolves to the source token module during the package build.
6. Production JavaScript has no accidental StyleX runtime requirement beyond the existing public `@stylexjs/stylex` import.

The package-level fixture is now the repository's own build: both StyleX packages were built with the tsdown configs, their CSS assets were emitted, their declaration files were bundled, and their direct ESM imports succeeded.

## Recommended repository direction

1. **Use tsdown as the build policy for every public package.** This keeps JavaScript and declaration output under one library-oriented pipeline and removes the need for a handwritten post-build import rewrite.
2. **Use the StyleX Rolldown adapter inside the package's tsdown config.** Keep the token alias explicit for `console-ui`, and retain the existing CSS export and `sideEffects` contract.
3. **Do not use raw Rolldown as the package policy.** Rolldown supplies the bundling engine and plugin API; tsdown supplies declaration bundling, dependency handling, and library defaults. The official Rolldown guide directs library authors to tsdown: [Rolldown getting started](https://rolldown.rs/guide/getting-started).
4. **Do not enable tsdown `unbundle` mode for this objective.** It preserves separate emitted modules and therefore does not remove the native-ESM relative-import boundary.
5. **Keep source imports extensionless.** The source language is TypeScript; emitted ESM is the boundary at which generated file references become explicit. Do not write `.ts` or `.js` into source relative import declarations merely to satisfy the output format.

### Bottom line

The cleanest end state is **one tsdown config per public package, with StyleX integrated through its Rolldown adapter**. It gives the repository one owner for JavaScript, declarations, and CSS assets, while preserving native ESM exports and the StyleX stylesheet contract. The handwritten rewrite script and the duplicated package-level Vite/type-build configuration are no longer part of the build path.
