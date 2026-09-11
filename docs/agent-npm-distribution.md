# Agent npm distribution

## User entrypoint

For the terminal UI, run from your project:

```sh
npx @lenso/agent auth login
npx @lenso/agent profiles install coding
npx @lenso/agent --profile code
```

Use `npx @lenso/agent doctor`, `npx @lenso/agent run --profile plan
"Review this project"`, or `npx @lenso/agent acp` for diagnostics, headless
requests, or editor integration. `npx @lenso/agent tui --help` shows native
terminal options. The root `--version` is the npm version; `tui --version`
is the bundled Agent version.

Terminal commands inherit the current workspace, environment, and stdio.
They use the native Agent Home and configuration rules; `profiles install`
cannot bypass an existing managed Home. Use the browser's coding setup for
SQLite-managed Homes.

Run `npx @lenso/agent web` from the workspace to use. The first published npm
cohort is 1.6.0; `npx @lenso/agent@1.6.0 web` selects that exact release.
Building or merging this repository does not publish a newer npm version.

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
App Agent Web, Console Agent Web, the terminal UI, management CLI, and ACP. No Cargo, Git checkout, tar executable,
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
The smoke installs actual npm tarballs offline without scripts into an empty npm
cache. It runs with isolated, unauthenticated Homes and only Node on PATH, checks
the UI assets, login controls, Profiles and workspace, then exercises occupied
ports, restart, signals and child crashes. It verifies every owned process exits.

## Publication setup

The three packages were initialized at 1.6.0 using a registry-owner-authorized
one-time publication exception. Their Trusted Publishers are now configured;
subsequent releases use the workflow below without the initial bootstrap step.

The npm Trusted Publishers are configured for `@lenso/agent`,
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

## Connect a Projects business App

Agent 0.1.9 adds the optional `lenso.agent.business-connection` Plugin. A running
business App must expose Auth browser consent and Projects Tool ingress. Model
login and business login are separate; Agent approval mode does not grant
business permissions. Follow the [real Projects acceptance guide](https://github.com/LioRael/lenso-agent/tree/main/scripts/projects-acceptance)
for a disposable local App and its permission checks.

The npm launcher uses SQLite-managed Plugin configuration by default. On the selected
Agent's Connections page, choose **Add Projects App**, enter its name and origin,
and save the validated configuration. Use Plugin settings to edit an existing
connection. The first release supports one Projects App per Agent because its
Tool names are shared. The
acceptance guide's file-based Plugin Root is an alternative configuration
authority: select `LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY=local_plugin_root`
when running that specific fixture. Do not assume editing Plugin Root files
changes an existing SQLite-managed Agent.

After the connection is configured, use that Agent's Connections page to open the
business App's consent page. Approve its exact scope, then enable the intended
Projects Tools in Agent Tool access. The local fixture delegates
`projects_get_issue`, `projects_list_issues`, `projects_list_projects`,
`projects_list_issue_workflow_states` and `projects_update_issue`. Tool access
cannot widen the business App's grant. Credentials stay inside the Agent process;
restart requires reconnecting. The App can revoke the parent session and its
child grant independently of Agent approval mode.

## Public availability after publishing

npm scans packages before making them installable. The publishing workflow waits
for both platform packages to expose the exact uploaded archive integrity and a
public tarball before publishing the launcher, then checks the launcher too.
This can take several minutes after `npm publish` succeeds. A bounded wait
failure requires inspecting registry scan/publication status, not overwriting
or immediately republishing the same immutable version.

See [npm publish-time scanning](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).
