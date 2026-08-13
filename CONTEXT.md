# Console Domain Context

## Terms

- **Operator**: An authenticated user who is allowed to enter the independent
  Lenso Console.
- **Console administrator**: An Operator with the `console.admin` authority
  required by Console administration endpoints.
- **Superadmin**: An explicitly designated Console administrator with authority
  across the capabilities exposed by the current Console Service. A superadmin
  designation does not change ownership of state held by individual Modules.

### Runtime evidence

- **Execution Evidence Group**: A purpose-named, recursively redacted view of
  evidence for one execution node in a Runtime Story. Its meaning follows the
  execution type, such as Request, Response, Call, Event, Envelope, Delivery,
  Input, Result, Workflow, or Compensation.
  _Avoid_: Payload section, raw record dump
- **Execution Evidence Gap**: An explicit statement that a field is either not
  applicable to an execution or was not captured by its evidence source. A gap
  is evidence about availability; it is not represented as an empty value.
  _Avoid_: Missing payload, blank body

### Module presentation

- **Module Surface**: A trusted, same-realm presentation contributed by a Module
  and rendered within a Host-owned region of Lenso Console.
  _Avoid_: Extension, plugin page
- **Surface Root**: The Host-provided boundary within which a Module Surface may
  present and locally theme its content.
- **Surface Styling Contract**: The versioned visual contract that a Module
  Surface is encouraged to follow to remain visually compatible with the Host
  Theme. It is authoring guidance rather than a style-isolation boundary.
  _Avoid_: Shared stylesheet
- **Host Theme**: The Console-owned visual theme applied to the Shell and made
  available to Module Surfaces. Only the Host may activate a global theme, and
  its definition may come from Console or a compatible Theme Package.
  _Avoid_: Module theme, global Module theme
- **Theme Package**: A compatible visual definition that can supply a Host Theme
  without changing Module behavior or ownership boundaries. It may customize
  Host presentation and layout tokens that remain unavailable to Module
  Surfaces.
  _Avoid_: Skin, Module theme
- **Console Composition**: An executable presentation contribution that may
  replace React components and reorganize, group, or collapse Console navigation
  and is encouraged to keep every Console capability reachable.
  _Avoid_: Theme, Module Surface
- **Theme Bundle**: An installable presentation bundle containing a Theme Package
  and, optionally, a Console Composition. An Operator selects the Theme Bundle
  that determines both their Host Theme and Console composition.
  _Avoid_: Theme Package
- **Theme Variant**: A named color-scheme realization within a Theme Bundle. An
  Operator selects a variant directly or allows the operating system to resolve
  between supported dark and light variants.
  _Avoid_: Theme Bundle
- **Themeable Host Token**: A Host-owned visual or layout decision that a Theme
  Package may redefine but a Module Surface may only experience through the
  resulting Host Theme.
  _Avoid_: Public Surface token
- **Surface-local Token**: A visual meaning defined and used by one Module
  Surface without altering the Host Theme or another Module Surface.
  _Avoid_: Global override

### Design conformance

- **Approved Figma Frame**: A Figma frame approved and registered as the
  reference for a particular implementation or review. The repository does not
  duplicate the frame or store screenshots; the Figma source remains the
  authority.
  _Avoid_: Ad hoc mock, screenshot baseline
- **Accepted Variance**: A recorded difference in dynamic content that may vary
  from an Approved Figma Frame without changing its visual language or structure.
  _Avoid_: Pixel-perfect exception
