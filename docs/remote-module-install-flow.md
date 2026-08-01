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

The legacy install command reads the manifest, derives the remote base URL when
the manifest URL ends in `/manifest`, then writes host-local service state:

- `.env`: adds or replaces the module entry in `REMOTE_MODULES`.
- `.lenso/module-installs.json`: records the module source and host-local writes.

Expected CLI output points at the same short path:

```text
Installed service module billing.
Updated:
- .env
- .lenso/module-installs.json
Next steps:
- restart the API and worker
- reload Runtime Console
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

Restart the API and worker so `REMOTE_MODULES` is loaded. Console UI packages
are selected and delivered by the standalone Console Service release; the
managed application does not copy or serve them.

When the host API is running, the Runtime Console can show available modules
from:

```text
GET /admin/data/available-modules
```

The Available Modules panel keeps that view lightweight: it shows module name,
version, source, summary, capability count, console package count, compatibility
preflight status, archived catalog entries, and copyable module install
commands. Current Module Ecosystem installation uses reviewed Module Change
Plans and durable Operations rather than browser-owned or host-local Console
bundle installation.

The repository's `remote-crm` fixture demonstrates the installed-console
surface path. Its manifest declares `@lenso/remote-crm-console` /
`remoteCrmConsoleModule`, and the workspace package contributes the
`/data/remote-crm` page through the static package set. Third-party Modules can
instead publish a reviewed Console artifact in their Module Release. The
Console Service downloads and verifies that artifact, materializes the immutable
object below its configured artifact root, and records the selected composition
receipt. Executable UI is resolved from the digest-bound release and loaded in
an isolated cross-origin frame; the Service does not publish a same-origin
extension registry.

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

This updates the host-local service source configuration.

### Console package

If a Console UI artifact is missing, inspect the reviewed Module Change
Operation and the Console composition receipt. Applying the operation calls the
Console Service artifact management endpoint, which downloads, verifies, and
materializes the exact digest-bound object. Managed application hosts do not
expose a Console extension registry or embedded Console compatibility routes.
