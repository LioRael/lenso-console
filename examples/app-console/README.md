# App-owned Console

From this repository build the shared Shell once with `pnpm service:web-build`.
Then use the local Engine CLI:

```sh
lenso app dev --root examples/app-console
```

Open the printed HTTP address. The App composes its own Console and discovers
`app/orders/console/` through the explicitly adopted Console support package.
There is no Agent prerequisite. The example is an integration fixture, not an
Agent application. `lenso app build` creates a source-free distribution.

This local native support package currently requires Cargo when compiling a new
Host. Running the resulting distribution needs no source, Cargo, or Node. The
Bun runtime is included by the App packager for portable contribution providers.

For application development without Cargo or this source checkout, use the
[precompiled Console development package](../../packages/console-dev/README.md).
