# Welcome Workspace test fixture

This package is a development dependency of `lenso-console-app`. It is not
linked into either production binary and has no Host default activation.
Tests explicitly select `plugins/lenso.console.workspace.welcome/default.toml`.

It demonstrates the UI Contribution and Workspace Service contracts with a
`greet` request and `ticks` stream, including limits, cancellation and removal.
The fixture owns a bounded in-memory log and no durable resources. The frontend mock
catalog is separate development-only test data.

Select two named instances with `alpha.toml` (`label = "Alpha"`) and `beta.toml`
(`label = "Beta"`) under the same Plugin directory. Console derives separate mount
IDs from their owner identities; `pageId` and `implementationId` remain shared.
The same page supplies read-state and append-log actions without copied modules.
Optional `authorization` selects the existing Auth SDK's exact issuer/public key
and allowed subject; every request checks its workspace-service operation audience.
The Native ingress regression uses disposable signed fixture assertions, verifies
denial without log mutation, and never reads login credentials.
