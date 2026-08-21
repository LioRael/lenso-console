# Lenso Console context

Lenso Console is an independent Lenso App for operating other Apps. Its new
architecture is defined from current Lenso vNext vocabulary rather than from
the retired Service-oriented Console implementation.

## Language

**Console**:
The independent Lenso App through which an Operator observes and controls one
or more explicitly connected target Apps.
_Avoid_: System Plane, Console Service

**Operator**:
A person acting through Console to observe or control a Target App. An Operator
is distinct from a product user inside a Target App.
_Avoid_: User

**Target App**:
An App selected as the scope of Console observation or control. It remains
authoritative for its own runtime and product state.
_Avoid_: Managed Service, Target Service

**Console Client**:
The operator-facing realization of Console. Native desktop and Web are delivery
targets of the same Console Client, not separate products.
_Avoid_: Desktop Console, Web Console

**Console Host**:
The stable part of the Console Client that owns the GPUI window, Operator
session, selected Target App, navigation, and Console Generation replacement.
It is not itself a mutable App graph.
_Avoid_: Console Shell

**Console Generation**:
One running realization of a complete immutable Console Resolved App Plan. A
candidate generation replaces an active generation only after reaching its
Ready Gate.
_Avoid_: Hot-reloaded graph

**Module UI**:
A portable presentation Module composed into Console and interpreted through a
versioned, renderer-neutral Interface. A package may publish both a business
Module for a Target App and a distinct Module UI for Console; every admitted
Module UI is available in both native and Web Console Clients.
_Avoid_: Surface, extension, plugin page

**Module UI Component**:
The immutable WebAssembly Component artifact through which a Module UI
implements the versioned Module UI World. The same artifact digest executes in
native and Web Console Clients and contains no GPUI or platform dependency.
_Avoid_: UI bundle, native UI plugin

**Declarative Module UI**:
The bounded TypeScript authoring language that Lenso compiles ahead of time
into a Module UI Component without embedding Bun or a JavaScript engine.
_Avoid_: React app, runtime JavaScript plugin

**Artifact Admission**:
The Console-controlled decision and verification process that makes one exact
Module UI Component digest eligible for App Composition. Publisher identity or
Target App advertisement alone never constitutes admission.
_Avoid_: Automatic plugin discovery, signature-only trust

**Module UI World**:
The WIT world shared by every Module UI Component. It defines renderer-neutral
metadata, lifecycle, input, view, and Host-effect interactions.
_Avoid_: GPUI API, browser bridge

**Unavailable Module View**:
A declared Module View that cannot operate in the selected Target App because
an exact required Operation is absent or incompatible. Unavailability does not
trigger fallback binding or change the Console Generation.
_Avoid_: Failed Module View, fallback provider

**Module View**:
A stable, independently mountable presentation declared by a Module UI. A
Module View does not imply a browser page, GPUI view type, placement, or window.
_Avoid_: Surface, page

**Module View Descriptor**:
The immutable manifest declaration of a Module View's identity, typed
parameters, required Operations, presentation metadata, and placement hints.
Runtime data cannot introduce a new descriptor.
_Avoid_: Route definition, dynamic menu item

**Module View Instance**:
One mounted realization of a Module View, isolated by Console Generation,
Module Instance, View identity, mount identity, and immutable Target App
binding. Repeated mounts never imply shared transient UI state.
_Avoid_: UI singleton

**View Tree**:
The complete renderer-neutral presentation value returned by a Module UI
Component after initialization or an event. Stable node identities let the
Console Host reconcile it into GPUI without exposing the renderer to the
Component.
_Avoid_: DOM, GPUI element tree, display list

**Host Theme**:
The Console-owned realization of semantic color, typography, spacing, shape,
motion, focus, and density across every Module View. Module UI expresses
bounded semantic intent but cannot replace or globally mutate the Host Theme.
_Avoid_: Module theme, stylesheet

**Module UI Asset**:
A digest-bound, budgeted image, SVG, or icon packaged with a Module UI
Component and decoded by the Console Host. Fonts, remote resources, and runtime
downloads are not Module UI Assets.
_Avoid_: Remote asset, Module font

**Module UI Event**:
One ordered input delivered by the Console Host to a Module UI Component. User
interaction and completed or failed Host work enter through the same event
mailbox.
_Avoid_: DOM event, callback

**Module UI Effect**:
A typed request returned as a value by a Module UI Component for work that only
the Console Host may authorize and execute. Its outcome returns as a later
Module UI Event.
_Avoid_: Host call, URL request, ambient capability

**Operation Risk**:
The authoritative risk classification carried by an Operation contract and
enforced by the Console Host when a Module UI requests that Operation. Module
UI presentation cannot reduce it.
_Avoid_: Dangerous button style, UI-declared permission

**Module Command**:
A statically declared, Host-registered Console command contributed by a Module
UI. The Host owns discovery, shortcut assignment, conflicts, authorization, and
dispatch.
_Avoid_: Global key handler

**Virtual Collection**:
A semantic list, table, or tree whose Component supplies only the item window
requested by the Console Host. The Host owns viewport measurement, overscan,
row reuse, and scrolling mechanics.
_Avoid_: Infinite View Tree, pixel scroll protocol

**Module UI Stream**:
A Host-owned, backpressured sequence opened by a Module UI Effect and delivered
to a Component as ordered batches of Module UI Events.
_Avoid_: Component socket, unbounded event feed

**Module UI Fault**:
The isolated failure of one Module UI instance after a trap, budget violation,
or invalid View Tree. It does not imply failure of the active Console
Generation.
_Avoid_: Console crash, generation failure

**Target Connector**:
A Target App Module that exports only the explicitly selected portable
Capabilities through which Console may observe or control that Target App.
_Avoid_: Global registry, invoke-anything endpoint
