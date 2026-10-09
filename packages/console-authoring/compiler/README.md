# Console directory convention

One selected `console/` directory becomes one UI Contribution provider. A private
`console/package.json` isolates frontend dependencies from the Plugin core. The
explicit authoring command triggers compilation. Sources are
bundled once; nested pages do not become separate runtime Plugins.

The compiler uses the existing `lenso.convention-compile.v1` protocol and returns
an ordinary Bun provider using the retained `lenso.ui.contribution@1` wire
contract. This is a public compiler protocol, not native runtime assembly.
Compilation alone does not install the provider into a TypeScript Lenso app.
