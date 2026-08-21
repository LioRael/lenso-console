# GPUI Console architecture

Lenso Console is rebuilt as one independent cross-App Lenso product with native
and Web GPUI delivery targets. The previous React Console, `console_ui_esm`,
same-realm Module presentation, executable Theme Bundles, and Service-oriented
domain model are not compatibility inputs.

## Shape

```text
Console Host
├── GPUI window, navigation, Operator session, Host Theme
├── active immutable Console Generation
├── optional candidate Console Generation
└── exact last-known-good rollback generation

Console Generation
├── Console-local Module UI Modules
├── typed Connector clients
├── Module UI Execution Adapter
└── immutable Resolved App Plan

Module UI Module
└── one admitted WebAssembly Component
    ├── static Module View descriptors
    ├── sequential init/update/view state machine
    ├── complete semantic View Tree
    └── typed Module UI Effects
```

The Host keeps the Client visible while it starts a candidate generation,
waits for readiness, atomically activates it, and drains the former generation.
No running graph is mutated.

## Module UI contract

Every Module UI implements one exact version of the Lenso Module UI WIT world.
The same artifact digest runs in native and browser hosts and contains no GPUI,
DOM, Bun, filesystem, network, process, or ambient platform Interface. Rust uses
the `lenso-console-ui` SDK. Bun and TypeScript use a bounded declarative language
compiled ahead of time into the same Component format without a JavaScript
runtime.

Each mount creates an independent Module View Instance with one immutable Target
App binding. The Host owns routing, placement, windows, input mechanics,
virtualization, accessibility, themes, localization, assets, effect execution,
resource budgets, and failure recovery. The Component owns transient product UI
state and returns complete renderer-neutral trees with stable node identities.

The Module UI Execution Adapter inside each Console Generation owns Component
instantiation, WIT translation, FIFO mailboxes, budgets, and failure
translation. The portable Kernel remains unaware of GPUI and Wasm mechanics;
the Host talks to typed Module endpoints rather than Component memory.

## Authority

Module UI effects reference only generated, statically bound Operations or
bounded Host actions. A fixed typed Connector Adapter receives attenuated
Target App context at runtime. Missing target requirements make a View
unavailable; they never cause provider fallback or graph rebinding.

Artifact signatures prove origin but do not grant trust. Console admits an exact
digest only after administrator or organization policy selection, provenance
and contract verification, static Component inspection, isolated probes, and a
candidate-generation Ready Gate. Traps and policy violations fault one View
instance after activation.

## Delivery gate

The first implementation is a vertical conformance slice proving one identical
Component digest in native and browser hosts. It must cover the state machine,
semantic tree, typed effects, Target switching, generation replacement,
resource containment, input, accessibility, virtual data, and streaming. Target
support is claimed from runtime evidence, never target compilation.

The executable scope and exit criteria are defined in the
[vertical validation plan](gpui-console-validation-plan.md).

## Decisions

- [ADR 0006](../adr/0006-rebuild-the-independent-console-with-gpui.md): GPUI
  rebuild and compatibility break.
- [ADR 0007](../adr/0007-compose-module-ui-into-immutable-console-plans.md):
  Module UI participates in Console App Composition.
- [ADR 0008](../adr/0008-replace-console-generations-behind-a-stable-host.md):
  stable Host and atomic generation replacement.
- [ADR 0009](../adr/0009-standardize-module-ui-on-a-wasm-component-world.md):
  one portable Component artifact.
- [ADR 0010](../adr/0010-run-module-ui-as-sequential-state-machines.md):
  event, View Tree, and effect model.
- [ADR 0011](../adr/0011-contain-module-ui-faults-and-bound-effects.md):
  fault, budget, and cancellation semantics.
- [ADR 0012](../adr/0012-scope-module-view-instances-and-host-routing.md):
  mount and Target isolation.
- [ADR 0013](../adr/0013-render-a-semantic-view-tree.md): semantic UI language.
- [ADR 0014](../adr/0014-compose-static-module-view-descriptors.md): static View
  catalog and Host placement.
- [ADR 0015](../adr/0015-let-the-host-own-visual-and-locale-realization.md): Host
  visual, locale, and asset realization.
- [ADR 0016](../adr/0016-separate-platform-input-and-bound-live-data.md): input,
  virtualization, streams, and optimistic state.
- [ADR 0017](../adr/0017-enforce-semantic-interaction-in-the-host.md): forms,
  Operation risk, commands, platform effects, and accessibility.
- [ADR 0018](../adr/0018-compile-declarative-typescript-module-ui.md): Bun and
  TypeScript authoring.
- [ADR 0019](../adr/0019-hide-wit-bindings-behind-language-sdks.md): Rust SDK and
  WIT version support.
- [ADR 0020](../adr/0020-admit-exact-module-ui-artifacts.md): trust and admission.
- [ADR 0021](../adr/0021-bind-ui-to-typed-target-connectors.md): Target App
  Operation binding.
- [ADR 0022](../adr/0022-separate-generation-readiness-from-target-availability.md):
  readiness, unavailability, rollback, and revocation.
- [ADR 0023](../adr/0023-ship-host-themes-with-console-v1.md): v1 theme scope.
- [ADR 0024](../adr/0024-require-native-and-web-runtime-proof.md): cross-runtime
  production evidence.
