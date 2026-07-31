# Lenso Console

Lenso Console is an independently installed Service for operating one Lenso
System. It owns operator identity, Console composition, the System Registry,
management intent and durable operation evidence. Managed Services remain the
authority for their own state and expose management only through the System
Plane Protocol.

The Console is not embedded in a managed Service and is never on a business
request path. It does not read a managed Service Store or host business
administration pages.

Repository: [LioRael/lenso-console](https://github.com/LioRael/lenso-console)

## Product shape

- `service/` contains the Console API, Worker, migrations and linked official
  Modules.
- `src/` contains the capability-neutral web shell, identity/session gate,
  composition recovery gate and isolated Module UI host.
- `packages/console-bridge/` is the only public browser package. It implements
  `lenso.console-bridge.v1` for sandboxed Module UI artifacts.
- `packages/console-system-plane/` contains Console-owned contracts and Store
  migrations.

The shell has no built-in management page. A reviewed Console composition binds
exact Module Releases, optional UI artifact digests and an explicit permission
subset. UI artifacts run in sandboxed iframes without `allow-same-origin`; the
parent validates every Bridge request against a short-lived handle and the exact
composition grant. Operator credentials never enter the iframe.

## Local development

Install dependencies and start the complete Console Service:

```bash
pnpm install
pnpm service:serve
```

Or use the external CLI from a source checkout:

```bash
lenso console dev --console-root /path/to/lenso-console
```

Useful commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm service:check
pnpm check
```

## Composition

Composition changes are created and applied by the external Console
Installation Authority:

```bash
lenso console composition plan \
  --composition composition.json \
  --env-file console.env \
  --output composition-plan.json

lenso console composition apply \
  --plan composition-plan.json \
  --env-file console.env \
  --approve-plan-digest sha256:...
```

Plan application uses revision compare-and-set, an immutable plan digest and an
append-only composition history. Installing a Module never grants permissions
implicitly.

## Module UI authoring

Create a Module-owned UI artifact with the framework CLI:

```bash
lenso module create billing --with-console-ui
lenso module dev --console-ui --repo-root ./modules/billing
```

The artifact and its manifest declaration are released atomically in the same
Module Release. The catalog never indexes an independent Console package.

## Release authority

Production release and promotion are coordinated by `LioRael/lenso-release`.
Repository write access alone does not authorize publication. Follow the
reviewed release runbook and use the coordinator-issued plan and receipts.
