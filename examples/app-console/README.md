# Console page source example

`app/orders/console/` demonstrates pages, dynamic route parameters and optional
typed service declarations. It is compiler input, not an executable application.
The old native development-kit configuration has been removed.

After preparing and installing workspace dependencies:

```sh
bun packages/console-authoring/author.mjs check --entry examples/app-console/app/orders/console
```

This checks and builds the page source without starting services or granting
authorization. Use [the TS host](../../packages/console/README.md) for runnable
application assembly and [the SDK guide](../../packages/console-authoring/README.md)
for page authoring. Compilation does not automatically install the emitted provider
into a TypeScript Lenso application.
