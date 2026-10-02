# Lenso Console

Standalone Console Host launcher. This package and its exact-version platform
runtime contain no Agent binary and do not install or start Agent.

```sh
lenso-console --port 3030 --no-open
```

Console retains existing Host configuration, authentication realm and audience.
Agent connections are configured separately. Installing this package does not
activate management MCP or grant tools to another Plugin.

This is an unpublished local package candidate. Build `lenso-console` from
`apps/reference-host`, build the Web assets, then stage with:

```sh
node tooling/distribution/package-console.mjs darwin-arm64 \
  target/release/lenso-console apps/shell/dist/client /tmp/console-package
```

The existing `@lenso/agent web` combined distribution remains available.
