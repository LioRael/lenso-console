# @lenso/remote-module-kit

Compatibility helpers for the old remote-module entrypoint.

New services should use `@lenso/service-kit` with `defineService`,
`defineModule`, and `serveService`. This package remains available for hosts
and examples that still speak the V4 remote-module protocol directly.

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
- `pnpm pack --dry-run`: build and inspect the publish tarball without uploading
  it.

## Publishing

This package is published with `@lenso/service-kit` through the repository's
reviewed release plan and coordinator-authorized `publish.yml` workflow. The npm
packages should be configured for trusted publishing with:

- repository: `LioRael/lenso-runtime-console`
- workflow: `publish.yml`

From the repository root, run the package preflight before opening a release
PR:

```sh
pnpm package-readiness
```

Add both packages to the reviewed release intent when either SDK changes. After
the generated release PR is reviewed and merged, the release coordinator invokes
`publish.yml` at the exact approved commit. Do not dispatch a package-specific
publisher directly.
