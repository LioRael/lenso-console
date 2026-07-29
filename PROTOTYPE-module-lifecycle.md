# Runtime Console Module lifecycle prototype

> PROTOTYPE — throwaway branch asset for the Lenso Module Ecosystem V1 decision map. This is not production implementation and contains no real mutations.

Question: what complete Runtime Console experience should make Module discovery, inspection, install, configuration, migration, build, restart, update, recovery, and uninstall understandable?

The existing `/modules` route hosts three structurally different variants:

- `A` — guided workspace: Module-first selection, one lifecycle plan, gates and evidence in context.
- `B` — operations cockpit: fleet state and active operations first, with a dense inspector.
- `C` — relationship canvas: Module, Service, dependency and lock authority visualized before actions.

Run once:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open:

```text
http://localhost:5173/modules?prototype=lifecycle&variant=A
http://localhost:5173/modules?prototype=lifecycle&variant=B
http://localhost:5173/modules?prototype=lifecycle&variant=C
```

Use the floating switcher or the left/right arrow keys. The in-memory walkthrough supports required Config/Endpoint inputs, plan review, one-person approval, stepwise apply, a simulated migration failure and repair plan, exact lock-generation restart proof, activation, and conservative uninstall.

The full prototype state is rendered in every variant. Refreshing resets it.
