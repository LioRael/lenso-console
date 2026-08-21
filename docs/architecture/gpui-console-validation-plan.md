# GPUI Console vertical validation plan

The architecture is not validated by a native GPUI demo, a gpui_web build, or a
standalone WebAssembly Component in isolation. The first delivery must prove
their composition with one exact artifact and the accepted Console lifecycle.

## Objective

Run one digest-identical Module UI Component in native and browser Console
Hosts, render its semantic View Tree through GPUI and gpui_web, execute typed
effects, and replace its immutable Console Generation without closing the
Client.

## Slice

The proof uses one Rust-authored Component and one generated declarative
TypeScript Component implementing the same draft Module UI World. Each exposes
one Module View with:

- typed initialization parameters and immutable Target App context;
- text input that exercises IME, focus, validation, and stable node identity;
- a virtualized collection populated by a typed fake Connector Operation;
- a bounded stream appended in ordered batches;
- one optimistic write with success and failure results;
- one Host-confirmed destructive Operation;
- localization, an admitted SVG asset, keyboard command, and accessibility
  semantics; and
- an intentional trap and resource-budget violation for containment evidence.

## Milestones

1. **Pin inputs**: record exact Zed/GPUI, Rust, Component Model, browser bridge,
   SDK, compiler, and browser versions. Build from locked inputs.
2. **Prove one Component**: produce one Component digest, audit its imports, and
   execute the same bytes through native and browser hosts without platform
   imports.
3. **Prove the state machine**: run identical init, event, complete View Tree,
   stable identity, and effect fixtures in both hosts and a headless harness.
4. **Prove rendering**: reconcile the semantic tree through native GPUI and
   gpui_web and capture geometry, interaction, focus, IME, and accessibility
   evidence.
5. **Prove bounded live data**: exercise virtualization, stream backpressure,
   cancellation, deadlines, late results, and mailbox limits.
6. **Prove generation replacement**: keep generation N active, fail one N+1
   candidate, activate a healthy N+2 candidate atomically, drain N, and roll
   back to its exact Plan and artifacts.
7. **Prove admission**: reject a digest mismatch, undeclared import, descriptor
   mismatch, incompatible world, oversized asset, unapproved publisher, trap,
   and resource-budget violation without disturbing the active generation.

## Exit criteria

- Native and Web evidence identifies the same Component digest.
- No Module UI code imports GPUI, DOM, network, filesystem, process, clipboard,
  storage, clock, randomness, or credentials.
- The Web path contains no React, WebView, or hidden DOM presentation fallback.
- Target switching creates a new View instance and cannot receive late events
  from the former Target App.
- Invalid or hostile Component behavior is isolated to one View instance after
  activation and blocks a required candidate before activation.
- Host-owned navigation, Operator session, Target selection, theme, locale, and
  window state survive generation replacement.
- Supported platform, browser, renderer, threading, input, and accessibility
  claims are limited to the environments actually exercised.

Failure of the identical-Component browser path blocks the Web target and
returns ADR 0009 or ADR 0024 for review. It does not silently introduce a second
Module UI format or renderer.

## Non-goals

- Rebuilding existing Console pages.
- Migrating `console_ui_esm`, React primitives, StyleX, or Theme Bundles.
- Stabilizing the full semantic node catalog.
- Supporting arbitrary JavaScript Component authoring.
- Selecting production storage, deployment, signing, or auto-update products.
