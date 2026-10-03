This consumer compiles the complete production Console Plugin, including Auth, management, contribution, and HTTP capability implementations, for `wasm32-unknown-unknown`. It prevents the regression where Console's native Tokio socket/process/filesystem features entered the Workers graph and failed in `mio` before Console could compile.

The fixed public Core revision is the cohort admitted by the Workers owner. The Auth SDK and capability remain at Console's original public revision. This fixture does not substitute an Auth implementation or a private Host.

After building the public Shell assets, run:

```sh
cargo check --locked --manifest-path tooling/fixtures/console-wasm/Cargo.toml \
  --lib --target wasm32-unknown-unknown
```

`LENSO_CONSOLE_SHELL_ROOT` may point to an absolute directory containing those publicly built assets. Compiling this consumer proves the target boundary; product activation, Auth material configuration, and deployment belong to the consuming App's qualification.
