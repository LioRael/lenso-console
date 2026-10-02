# App-owned Console

This fixture targets the separately pinned Engine development-kit protocol.
The current standalone Lenso CLI does not expose its `app dev --root` command.
For the current native Lenso Plugin API and removal proof, use
[the embedding example](../plugin-host/README.md).

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
[precompiled Console development package](../../packages/console-authoring/development-host.md).

For page-only development and generated service clients, use the single
[Console authoring entry](../../packages/console-authoring/README.md).

This fixture contains the optional typed service example. Its full WorkspaceService
role includes Stream, while the current Engine App Host only admits Request for
Bun. The generic Host therefore rejects this fixture at implementation admission.
Use the kit's page-only starter for a working default, or a qualified Host for the
service example. Do not treat a passing source compile as a running App.
