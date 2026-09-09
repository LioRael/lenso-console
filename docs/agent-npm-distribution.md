# Agent Web npm distribution

## User entrypoint

The intended released command is `npx @lenso/agent web`. It is available only
after the three npm packages have been published; building or merging this
repository alone does not make that command publicly available.

The launcher uses the current workspace and preserves existing Agent/Console
Homes. It accepts `--port` and `--no-open`. The Console listener stays on
loopback. Local sessions open a browser after the owned server reports ready;
SSH sessions print the URL. Runtime processes exit with the launcher.

## Ownership and versioning

See [ADR-0005](adr/0005-distribute-agent-web-through-npm.md). The root Console
application version determines all three npm package versions. The source
launcher manifest is a template; packaging replaces its version and optional
runtime dependency versions together. Update `scripts/distribution/agent-release.json`
only against exact released Agent artifacts and reviewed SHA-256 checksums.

Each platform package includes the Console service, API-mode client build,
App Agent Web and Console Agent Web. No Cargo, Git checkout, tar executable,
postinstall scripts, or network downloads are needed at runtime. Optional
coding capabilities still require their tools, such as Git and ripgrep.

## Build and verify

```sh
pnpm install --frozen-lockfile
pnpm service:web-build
cargo build --locked --release --manifest-path service/Cargo.toml --bin lenso-console-with-agent
node --test scripts/distribution/launcher.test.mjs
node scripts/distribution/package-agent.mjs darwin-arm64 service/target/release/lenso-console-with-agent .artifacts/npm
node scripts/distribution/smoke-agent.mjs .artifacts/npm
```

Use `linux-x64` on Ubuntu 24.04+ (glibc 2.39+). Packaging downloads only pinned Agent archives and
checks their SHA-256 values. Native CI packages and runs both supported targets.
The smoke installs actual npm tarballs offline without scripts, uses isolated
Homes, serves the real UI, checks the Agent catalog, and verifies termination.

## Publication setup

Configure npm Trusted Publishers for `@lenso/agent`,
`@lenso/agent-darwin-arm64`, and `@lenso/agent-linux-x64`: GitHub repository
`LioRael/lenso-console`, workflow `agent-npm.yml`, environment `npm`.
First-time package creation/publisher configuration requires the registry owner;
do not introduce long-lived npm tokens to bypass it. Allow direct `npm publish` for these publishers. The workflow uses the
GitHub environment named `npm`; match that name in the publisher settings.

After the Console version PR is merged, dispatch **Agent npm distribution** on
`main` with `publish=false`. Review both platform smoke results and artifacts.
Then dispatch with `publish=true` after registry authorization. The workflow
publishes platform dependencies before the launcher. Existing immutable npm
versions must never be overwritten; inspect registry state after an ambiguous
failure before retrying or advancing the version.
