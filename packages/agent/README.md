# Lenso Agent

Run a coding agent in your terminal, editor, or browser. Requires Node.js
22.12+, macOS 15+ on Apple silicon or Ubuntu 24.04+ x64 (glibc 2.39+).

```sh
npx @lenso/agent cli auth login
npx @lenso/agent cli profiles install coding
npx @lenso/agent --profile code
```

Use `npx @lenso/agent web` to open Agent and Console in your browser, or
`npx @lenso/agent acp` for an ACP editor. Native terminal options are available
with `npx @lenso/agent tui --help`; management and headless commands use `cli`.

No source checkout, Rust toolchain, postinstall script, or runtime download is
required. The current directory is your workspace. Upgrades preserve Agent and
Console Homes. Optional coding tools such as Git and ripgrep must be installed
on the host. For an existing SQLite-managed Home, use the browser's coding
setup instead of the offline Profile installer.

The npm version identifies the Console distribution; `tui --version` reports
the bundled native Agent version. Platform packages are exact-version runtime
dependencies and should not be installed separately.

[Documentation](https://github.com/LioRael/lenso-console/blob/main/docs/agent-npm-distribution.md)
