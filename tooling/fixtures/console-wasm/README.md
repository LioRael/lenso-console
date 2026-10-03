This consumer compiles the complete production Console Plugin, including Auth, management, contribution, and HTTP capability implementations, for `wasm32-unknown-unknown`. It prevents the regression where Console's native Tokio socket/process/filesystem features entered the Workers graph and failed in `mio` before Console could compile.

The fixed public Core revision is the cohort admitted by the Workers owner. The Auth SDK and capability remain at Console's original public revision. This fixture does not substitute an Auth implementation or a private Host.

After building the public Shell assets, run:

```sh
cargo check --locked --manifest-path tooling/fixtures/console-wasm/Cargo.toml \
  --lib --target wasm32-unknown-unknown
```

`LENSO_CONSOLE_SHELL_ROOT` may point to an absolute directory containing those publicly built assets.

The focused lifecycle check runs the real Kernel and production Console in Wasm,
using Core's portable conformance Driver. It activates relative-default and
explicit-absolute configurations, rejects each relative runtime path, and calls
the real health handler after activation. The JavaScript runner fails any attempted
host import; it supplies no filesystem or HTTP substitutes. The acceptance ABI is
confined to this consumer and is absent from the product Plugin.

```sh
CARGO_TARGET_DIR=/tmp/console-wasm-activation cargo build --locked \
  --manifest-path tooling/fixtures/console-wasm/Cargo.toml \
  --lib --target wasm32-unknown-unknown
node tooling/fixtures/console-wasm/activation.mjs \
  /tmp/console-wasm-activation/wasm32-unknown-unknown/debug/lenso_console_wasm_check.wasm
```

Auth material configuration and full App startup/deployment belong to the
consuming App's qualification. Paths here identify portable configuration
locations; they do not grant or emulate filesystem access. Native absolute-path
checks and Wasm rejection of filesystem-backed resources remain in force.
