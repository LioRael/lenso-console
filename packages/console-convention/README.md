# Console directory convention

One selected `console/` directory becomes one UI Contribution provider. A private
`console/package.json` isolates frontend dependencies from the Plugin core. Only
an adopted support Plugin triggers installation and compilation. Sources are
bundled once; nested pages do not become separate runtime Plugins.

The compiler uses the existing `lenso.convention-compile.v1` protocol and returns
an ordinary Bun Plugin providing `lenso.ui.contribution@1`. Console consumes it
through the same Plan-bound port as linked native providers.
