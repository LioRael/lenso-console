# Agent turn relay

This private Rust library owns detachable Agent turn streams and their transient
activity projection. It builds independently of Console, Lenso Plugins, the Kernel,
and the local process launcher. It remains in the Console repository and is not
published as a standalone package.

`TurnRelay` has two operations: `start(authenticated_request, body)` and `snapshot()`.
Clones share admission and activity for one Agent process; different processes use
different handles. The caller selects the exact target, supplies authentication,
forwards the resume header and enforces request limits and permissions. The relay
does not choose a target or grant authorization. Session facts and execution remain
owned by Agent; the activity snapshot is not durable session storage.

The relay validates JSON, rejects concurrent starts, sets JSON/SSE request headers,
and returns upstream status, content type and a stream of bytes. An independent task
keeps reading upstream if the browser disconnects before headers or drops the body.
Explicit cancellation still uses the selected Agent's existing cancel route.

Browser backpressure never suspends upstream reads. A broadcast queue retains at
most 32 owned frames of 32 KiB (1 MiB of frame payload). A lagging reader receives an
error and then terminates; it must recover history/activity through Agent rather than
interpret the partial response as completion. Upstream body failures also surface as
stream errors. Ordinary HTTP rejections retain their status and response body.

Activity observes the Agent's JSON `data:` lines, including split transport chunks.
Incomplete lines are bounded to 1 MiB; oversized lines are discarded through their
newline so their suffix cannot be mistaken for an independent event. Upstream
completion or failure clears the running state. Runtime task cancellation also
clears it and records an interruption. Dropping a relay handle is not cancellation:
the task keeps its own state until upstream ends or its Tokio runtime shuts down.

## Validation

```sh
cargo test --locked --manifest-path runtime/agent-turn-relay/Cargo.toml
cargo clippy --locked --manifest-path runtime/agent-turn-relay/Cargo.toml --all-targets -- -D warnings
```

Use the `lenso-cargo` wrapper inside the Lenso sibling workspace. `pnpm relay:check`
is included in `pnpm service:check`; `service:boundary` rejects reverse dependencies
on Lenso implementation packages. Tests use loopback HTTP servers and cover slow
consumers, disconnects before headers, duplicate admission, activity isolation,
byte fidelity, invalid requests, connection failures, HTTP rejection and body errors.
The Shell retains a real HTTP integration test for its response adapter.
