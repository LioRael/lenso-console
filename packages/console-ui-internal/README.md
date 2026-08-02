# Console UI Internal

Private UI primitives and linked-module composition types used by the Lenso
Console Shell. This workspace is not published and is not an extension SDK.

Module-owned executable UI is carried inside its owning Module Release, runs in
a sandboxed iframe, and communicates through `@lenso/console-bridge` with an
exact composition grant. External UI must not import this workspace.
