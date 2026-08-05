# Console UI Internal Compatibility

This private workspace preserves the legacy `@lenso/console-ui-internal` import
surface while the public UI implementation lives in `@lenso/console-ui`.

New Module UI must depend on `@lenso/console-module-api` and
`@lenso/console-ui`; it must not import this compatibility package.

The compatibility package is not an extension SDK and should disappear after
the built-in Console Modules migrate to the public package seam.
