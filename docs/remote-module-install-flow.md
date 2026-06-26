# Service Module Install Flow

Use this flow when a third-party module should stay outside the host workspace
but still contribute an already-built Runtime Console frontend bundle.

For a runnable service module that depends on published `@lenso/*` packages
instead of workspace paths, see
[LioRael/lenso-examples](https://github.com/LioRael/lenso-examples).

## Module Author

Create the standalone service module package:

```sh
pnpm create:module billing --remote --output-dir ../module-packages
```

Expose the service module protocol from a stable base URL:

```text
GET https://example.com/lenso/module/v1/manifest
```

Publish or otherwise make the console bundle named by the manifest's
`package.bundleUrl` available to the host application.

## Host Developer

Main path: `module install -> restart -> reload Runtime Console`.

Install a service module from the manifest URL:

```sh
lenso module install https://example.com/lenso/module/v1/manifest
```

If the manifest is read from a local file, pass the runtime base URL:

```sh
lenso module install ./lenso.module.json --base-url https://example.com/lenso/module/v1
```

The install command reads the manifest, derives the remote base URL when the
manifest URL ends in `/manifest`, then writes host-local state:

- `.env`: adds or replaces the module entry in `REMOTE_MODULES`.
- `.lenso/module-installs.json`: records the module source and host-local writes.
- `.lenso/console/extensions/<module>/*.js`: stores copied third-party console
  bundles.
- `.lenso/console/extensions/registry.json`: registers same-origin dynamic
  bundle exports for Runtime Console.

Expected CLI output points at the same short path:

```text
Installed service module billing.
Updated:
- .env
- .lenso/console/extensions/registry.json
- .lenso/console/extensions/billing/billing-console.js
- .lenso/module-installs.json
Next steps:
- restart the API and worker
- reload Runtime Console
```

Pass `--no-console-extension` when you want to skip Runtime Console extension
registration:

```sh
lenso module install https://example.com/lenso/module/v1/manifest --no-console-extension
```

Add a module to the local catalog only when you want it to appear in Runtime
Console's Available Modules panel before installing it:

```sh
lenso module catalog add https://example.com/lenso/module/v1/manifest \
  --summary "Billing workspace and operations"
```

This writes `.lenso/module-catalog.json`. It is a local or team-maintained
module list, not a publisher approval or review workflow. The catalog file is
intentionally small:

```json
{
  "version": 1,
  "modules": [
    {
      "name": "billing",
      "version": "0.1.0",
      "source": "remote",
      "manifestReference": "https://example.com/lenso/module/v1/manifest",
      "baseUrl": "https://example.com/lenso/module/v1",
      "summary": "Billing workspace and operations",
      "consolePackages": [
        {
          "packageName": "@vendor/lenso-billing-console",
          "exportName": "billingConsoleModule",
          "route": "/data/billing"
        }
      ]
    }
  ]
}
```

`module marketplace install` remains an alias for the install path:

```sh
lenso module marketplace install https://example.com/lenso/module/v1/manifest
```

Restart the API and worker so `REMOTE_MODULES` is loaded, then reload Runtime
Console so it reads `/console/extensions/registry.json`.

When the host API is running, the Runtime Console can show available modules
from:

```text
GET /admin/data/available-modules
```

The Available Modules panel keeps that view lightweight: it shows module name,
version, source, summary, capability count, console package count, compatibility
preflight status, archived catalog entries, and copyable module install
commands. Installing from a manifest URL writes local module configuration,
copies declared console bundles, and updates the Runtime Console extension
registry.

The repository's `remote-crm` fixture demonstrates the installed-console
surface path. Its manifest declares `@lenso/remote-crm-console` /
`remoteCrmConsoleModule`, and the workspace package contributes the
`/data/remote-crm` page through the static console package registry. Third-party
modules should use `bundleUrl` and the dynamic extension registry instead of
being compiled into the official Runtime Console bundle.

## Smoke Demo

Run the temporary-host smoke demo without mutating the working tree:

```sh
pnpm run demo:remote-module-package
```

Set `LENSO_KEEP_REMOTE_MODULE_INSTALL_DEMO=1` to keep the generated temp
directory for inspection.

Expected success output ends with:

```text
Remote module package demo passed
```

## Troubleshooting

### Remote source

If `REMOTE_MODULES` is missing a module or points at the wrong base URL, add the
module source again:

```text
fix: lenso module install <manifest-url> --base-url <base-url>
```

This updates `.env` and refreshes the local console extension registry.

### Console extension

If the Runtime Console extension is missing, reinstall the module so the host
copies the declared bundle and rewrites the registry:

```text
fix: lenso module install <manifest-url>
```

Reload Runtime Console after the API and worker restart so the bootstrap loader
reads `/console/extensions/registry.json` again.
