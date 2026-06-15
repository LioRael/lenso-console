# @lenso/remote-module-kit

Helpers for building out-of-process Lenso remote modules.

```js
import {
  adminAction,
  declarativeCustom,
  defineRemoteModule,
  getRoute,
  runtimeFunction,
  serveRemoteModule,
} from "@lenso/remote-module-kit";

const manifest = defineRemoteModule({
  admin: declarativeCustom({
    actions: [
      adminAction("sync_contacts", {
        capability: "crm.contacts.sync",
        label: "Sync contacts",
      }),
    ],
  }),
  capabilities: ["crm.contacts.read"],
  httpRoutes: [getRoute("/contacts/{id}")],
  name: "crm",
  runtimeFunctions: [runtimeFunction("crm.contacts.enrich.v1")],
});

const server = await serveRemoteModule(manifest, {
  actions: {
    sync_contacts: ({ input }) => ({ input, synced: true }),
  },
  port: 4100,
});

console.log(server.manifestUrl);
```

## Scripts

- `pnpm build`: emit JavaScript and declarations into `dist/`.
- `npm pack --dry-run`: build and inspect the publish tarball without uploading
  it.

## Publishing

This package is prepared for publication as a public scoped npm package. From
the repository root, run the package preflight before publishing:

```sh
pnpm package-readiness
```

Publishing is intentionally manual for now. The preflight only builds and
dry-runs the npm package; it does not upload to the registry.
