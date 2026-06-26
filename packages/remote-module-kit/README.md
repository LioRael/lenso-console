# @lenso/remote-module-kit

Helpers for building out-of-process Lenso service modules.

```js
import {
  adminAction,
  declarativeCustom,
  declarativePage,
  declarativeSection,
  defineRemoteModule,
  getRoute,
  queryValue,
  runtimeFunction,
  serveRemoteModule,
} from "@lenso/remote-module-kit";

const manifest = defineRemoteModule({
  compatibility: {
    console_package_api: "1",
    remote_protocol_version: "1",
    required_host_features: ["service.status"],
  },
  admin: declarativeCustom({
    actions: [
      adminAction("sync_contacts", {
        capability: "crm.contacts.sync",
        label: "Sync contacts",
      }),
    ],
    pages: [
      declarativePage("overview", {
        sections: [
          declarativeSection("health", {
            component: queryValue("health", {
              capability: "crm.health.read",
              valuePath: "metrics.contacts",
            }),
          }),
        ],
      }),
    ],
  }),
  capabilities: ["crm.contacts.read", "crm.health.read"],
  httpRoutes: [getRoute("/contacts/{id}")],
  name: "crm",
  runtimeFunctions: [runtimeFunction("crm.contacts.enrich.v1")],
  service: {
    name: "api",
    status_path: "/lenso/module/v1/status",
    transports: ["http"],
    version: "0.1.0",
  },
});

const server = await serveRemoteModule(manifest, {
  actions: {
    sync_contacts: ({ input }) => ({ input, synced: true }),
  },
  queries: {
    health: () => ({ metrics: { contacts: 2 } }),
  },
  port: 4100,
});

console.log(server.manifestUrl);
console.log(server.statusUrl);
```

`serveRemoteModule()` serves `GET /lenso/module/v1/status` by default. The host
and CLI use it for service-module readiness diagnostics; modules can pass
`status.checks` when they need to expose a small health summary.

## Scripts

- `pnpm build`: emit JavaScript and declarations into `dist/`.
- `npm pack --dry-run`: build and inspect the publish tarball without uploading
  it.

## Publishing

This package is published through the `publish remote-module-kit` GitHub Actions
workflow. The npm package should be configured for trusted publishing with:

- repository: `LioRael/lenso-runtime-console`
- workflow: `publish-remote-module-kit.yml`

From the repository root, run the package preflight before opening a release
PR:

```sh
pnpm package-readiness
```

After the release PR is merged, run the workflow from `main` with the package
version from `packages/remote-module-kit/package.json`. The workflow verifies
the version is not already published, runs `pnpm package-readiness`, and then
publishes from `packages/remote-module-kit`.
