---
status: accepted
---

# Rebuild the independent Console with GPUI

The independent cross-App Lenso Console will be rebuilt as one GPUI product
delivered for native desktop and Web targets. GPUI owns presentation on both
targets; React, DOM, StyleX, `console_ui_esm`, and the existing Console Shell are
not compatibility requirements for the new architecture. Existing code may be
reused only when it fits the new model without introducing a migration or
compatibility seam.

This decision applies only to the independent Console. It does not select GPUI
as the default framework for target-owned App Web UIs or for arbitrary product
interfaces built with Lenso.

## Considered options

- Permanent React and GPUI renderers were rejected because they would make two
  presentation implementations part of every future Console contract.
- A staged compatibility period for `console_ui_esm` was rejected because the
  Console is already expected to undergo a breaking reconstruction.
- A WebView-based desktop application was rejected because it would not produce
  a GPUI-native Console and would retain the browser presentation model.

## Consequences

The new Console may break every existing Module UI and Theme Bundle contract.
Module UI contribution, theming, composition, and artifact admission must be
redesigned for a GPUI Host and must work on both native and Web targets. A
Module UI uses a Lenso-owned renderer-neutral Interface rather than exposing
GPUI types. Code advertised by a connected target App is not executed unless a
Console administrator independently admits its exact artifact. Admitted code
has no ambient network, storage, filesystem, clipboard, or platform authority;
it can request only versioned Host-mediated effects that the Host authorizes in
the current Operator and target App context.

The same-realm React and CSS decisions in ADRs 0001, 0003, and 0004 are not
constraints on the rebuilt Console; token authority and the future theme model
remain separate decisions.
