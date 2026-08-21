---
status: accepted
---

# Compose Module UI into immutable Console plans

A Module UI is an ordinary Console-local Module selected by Console App
Composition, not executable metadata loaded automatically from a connected
Target App. A product package may publish separate business and Module UI
entrypoints, but installing the business Module in a Target App does not install
or trust its Module UI in Console.

Installing, enabling, disabling, or removing a Module UI changes Console App
Composition. Authoring resolves a new complete plan and activates a new Console
generation; it never mutates the running graph. How the Console Client switches
between generations without disrupting the Operator is a separate operational
decision.

A Module UI calls a Target App only through explicitly bound portable
Capabilities exported by a Target Connector. Console does not discover a
global target registry, gain ambient administrator authority, or expose a
stringly typed invoke-anything path.

## Consequences

The Console must independently admit the exact Module UI artifact it composes.
A connected Target App may advertise metadata, but cannot cause Console to
execute code. Console installation tooling must treat plan resolution,
generation readiness, activation, and retirement as explicit steps.
