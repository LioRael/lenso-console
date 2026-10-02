# Welcome Workspace test fixture

This package is a development dependency of `lenso-console-app`. It is not
linked into either production binary and has no Host default activation.
Tests explicitly select `plugins/lenso.console.workspace.welcome/default.toml`.

It demonstrates the UI Contribution and Workspace Service contracts with a
`greet` request and `ticks` stream, including limits, cancellation and removal.
The fixture owns no business state or durable resources. The frontend mock
catalog is separate development-only test data.
