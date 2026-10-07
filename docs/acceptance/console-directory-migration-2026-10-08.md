# Console directory migration acceptance

Recorded locally on 2026-10-08 (UTC evidence: 2026-10-07T18:13:00Z), on
`codex/console-directory-migration`. Implementation revision:
`745168ba4b0c2e4882c54251f9d389ecd51e51a3`. The subsequent receipt commit
changes documentation only; its full candidate SHA is supplied in the handoff.
This is local candidate evidence, not publication, deployment or upstream CI.

## Inputs and ownership

- Preview baseline: `96ddb9c61d7920ba71b2ab88da7240c1abd0675e`, retaining its
  integrated `b5b8c4af43a798ebe838388a1d889262e2fc037a` main and
  `790a8d35fe899dd00d0e7f6d3d474fc4e083e111` DX ancestors.
- Read the supplied `console-author-dev-acceptance.json` and checked its original
  archive SHA-256, `fb86c11145ddb4823f9f49831bdfffdb8586d3c7362202ac2ecceed017d93cc4`.
  Its npm/pnpm/Bun and simulated-backend results belong to that baseline.
- Read `console-author-dev-security-acceptance.json` and the security patch.
  Imported `de8392c65cfc76bb05c38f1e0f163d99ad0af27e` as the independent
  cherry-pick `883ef7ded0018dccb4ab05a33b287c8306dafb1b`. A final diff confirms
  that its three security files are unchanged from the supplied fix.
- The original task checkout remains clean at `de8392c65cfc76bb05c38f1e0f163d99ad0af27e`;
  its candidate and receipts were not rewritten. Core was read-only. Relay
  validation used a separate temporary copy, not its active repair checkout.

See [repository layout](../repository-layout.md) for the complete directory map.
The Shell move, Plugin pages, contracts, runtime packages and tooling were
committed separately. The only behavior fix added to the migration is the
supplied preview file-security correction. Development-kit staging also now
generates the preview closure rather than depending on previously generated
maintainer files.

## Invariants checked

- Shell package name remains `@lenso/console-web`, version `1.21.0`. Its dependency
  declarations, dev dependencies, engines and frontend toolchain are unchanged.
- SDK remains `@lenso/console-sdk`, version `0.2.0`; public exports, including
  `./shell`, binaries, dependency declarations, peer dependencies and engines
  match the original candidate.
- pnpm initially re-resolved Shell's Base UI during importer recreation. Review
  caught this and `b4480dc25e4e40ae1c8deb30cf35e7a3dcd6cff6` restored the original
  resolutions. A recursive comparison of every YAML document in the final
  lockfile finds zero differences after accounting for the importer rename.
  Shell retains Base UI `1.7.0`; the SDK retains its original distinct resolution.
- Production assets and generated preview sources derive from the sole maintained
  `plugins/console/shell` tree. SDK and development-kit packaging use the same
  generators; neither consumer reads a sibling checkout at runtime.
- Obsolete directories and Observe root assets are absent. A tracked-file scan
  found no old paths in active source, build, CI or packaging inputs.
  Dated acceptance documents and ADRs retain factual historical paths.
- Public routes, asset identifiers, Capability schemas and security boundaries
  were not renamed. Removing redundant grouping directories did not create a
  universal shared package or compatibility fallback.

## Fresh checks

| Proof | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed against restored resolutions |
| Shell, generated-contract and SDK typechecks | Passed |
| `pnpm lint`, `pnpm format:check`, Rust workspace format check, `git diff --check` | Passed |
| Console boundary and human-token projection checks | Passed |
| `pnpm test:local` | 45 files, 311 tests passed |
| Focused Chromium tests: context navigation, Observe, convention router, contribution recovery | 4 files, 16 tests passed |
| `pnpm test:distribution` | 20 passed, 1 development-Host test skipped without a configured kit |
| Final SDK archive, embedding, file-policy and proxy regressions | 6 passed, no skips |
| Development-Host source-checker tests | 14 passed |
| Compiler route/service tests | 4 passed, 13 assertions |
| Contracts wire tests | UI Contribution and Workspace Service tests passed |
| Reference Host `cargo check --locked -p lenso-console-app --all-features` | Passed |
| Console Plugin embedded-Shell check and Shell-serving tests | Passed; 5 focused Shell tests |
| Observe removable-contribution test | Passed |
| Private turn-relay and local-launcher tests | 6 + 3 passed |
| Assistant build, package staging and optional-runtime tests | Passed |
| Native Console build and existing `smoke-console.mjs` | Passed; packaged Shell and empty Agent catalog work without an Agent on PATH |
| Locked native Console support check | Passed; existing unused-facade dependency warning retained |
| Development-kit `pnpm deploy --prod --ignore-scripts` closure | Passed; installed compiler dependencies, production Shell, generated preview Shell and shared contracts present |

The existing embedding test now also compiles and reads the Plugin-owned default
`shell/dist/client` asset root. The archive test now includes the generated
preview closure as well as production resources. These extend existing tests:
external-asset overrides alone cannot catch a broken default path, and production
HTML checks alone cannot catch missing preview sources.

## Actual SDK archive consumer

Owner-packed archive: `.artifacts/archives/lenso-console-sdk-0.2.0.tgz`.
SHA-256:
`a9119cc116d184cab26c06c0e91a4165844139e52bdc80e5359bb5fee9265aaf`.
This filename/version identifies an unpublished candidate, not a registry release.

A new directory outside the checkout installed that archive through pnpm strict
`node_modules`, plus matching React/ReactDOM `19.2.8`. It ran the installed
`lenso-console-author init`, `check`, `build` and `dev --entry ./console --open`.
Those author commands ran with a PATH containing only Node and Bun; probes for
both `cargo` and `rustc` returned ENOENT. No Console source alias, root dependency
path or sibling repository was supplied to the consumer. The Playwright driver used the owner's
browser tooling, but the preview process resolved its runtime from the installed
consumer package only.

The fresh Chromium acceptance proved:

1. Official Shell and author page render.
2. TSX title and StyleX color update while the input draft, counter and open
   author dialog remain intact.
3. Dynamic order `42` navigation and return work.
4. A syntax overlay clears after repair; the official render-error boundary also
   recovers after repair.
5. The Shell color-mode portal supports keyboard opening, Escape and focus return;
   the official search modal opens and closes.
6. Desktop `1280×800` and narrow `390×844` states render in light/dark themes.
   The narrow popup remains inside the viewport and document width remains 390px.
   Actual screenshots were inspected, including the settled dark popup.
7. Outside files, `.env`, masked symlink targets and their raw forms return 403;
   an unknown Host returns 403. Normal author TSX returns 200.
8. SIGINT exits zero and the final listener (`57473`) refuses new connections.

Raw driver, request/cleanup receipt, screenshots and archive remain local ignored
validation artifacts under `.artifacts/`. The latest screenshot SHA-256 values:

| Screenshot | SHA-256 |
| --- | --- |
| Desktop dark | `2b31f791115d8155daf52ff5468f868e514599f6cef4efce626b87845e081b2d` |
| Narrow dark menu | `f75f3b976d85f1b95625afcad47e3bd9c2be9dbf526f74bdee81993d48438141` |
| Narrow light | `e3ea78548c49a00562036d042d2517843a2d2fcc4a284519ee86d81dd589b186` |

The driver passes `--open` but sets `BROWSER=none` to avoid launching an
uncontrolled desktop browser. It opens the actual URL in Chromium; OS browser
auto-launch is not claimed as newly verified.

## Isolated Relay consumer

Copied Relay's current Console source, including its untracked operator page,
and the two generated contracts it imports into `/tmp/relay-console-migration-12iwc6`.
Only the copy's SDK dependency was pointed at the same archive.

The first partial copy exposed two fixture omissions: the generated contracts
outside `console/`, then their `@lenso/contract-runtime` dependency. The active
Relay root `node_modules` symlink points at a missing vendor directory. The
complete isolated fixture therefore includes both contracts and a root-only
fixture manifest installing `@lenso/contract-runtime@0.3.1`. No Relay source,
TypeScript configuration, UI/runtime versions or active dependency files were
changed.

With that owner dependency supplied, Relay's `bun run check`, the compiler from
the installed SDK (`lenso.convention-compiled.v1`), onboarding browser bundle and
frozen Bun reinstall passed. Bun's existing unplugin/React peer warnings remain
visible. This proves consumer typechecking and page compilation, not Relay's
vendored Shell build, browser operation or backend qualification.

## Remaining limits

- **Real backend login is unverified.** The supplied baseline and security
  receipts cover simulated transport and rejection, not real authentication.
  The final proxy tests retain authentication/Origin/CSRF forwarding and stream
  shutdown checks; they are not a live login claim.
- The full no-Rust development-Host creation/startup test was skipped because no
  compatible complete kit was supplied. Native support compilation, production
  smoke and deployed SDK closure passed; these do not replace that runtime proof.
- SDK-only installation without explicit consumer React dependencies resolved
  React `19.3.0` with ReactDOM `19.2.8` in one clean attempt. The existing matching
  version guard rejected it. Acceptance used matching `19.2.8` consumer versions;
  no SDK dependency policy or dependency version was changed to hide the issue.
- Focused Vitest browser tests pass and exit zero, but emit the existing
  ten-second close-timeout diagnostic. The separate archive preview process
  exits normally and releases its listener.
- An attempted complete compiler npm/Bun consumer suite exceeded a 200-second
  terminal limit after its npm test passed. It is not recorded as a complete
  pass. Fresh installed CLI and isolated Relay compilation, plus the focused
  route/service tests, provide the bounded proofs reported above.
- No full ecosystem matrix, Linux candidate CI, portable WASM gate, push, main
  merge, npm/Cargo publication or deployment was performed.
- The specialized security-workspaces example retains its pre-existing
  sibling-owner dependency requirements; it was not rebuilt as part of this
  directory-only consumer migration.

## Review

A read-only independent review covered migration paths, Cargo dependencies,
frontend imports, SDK/development-kit closure, CI inputs and package contracts.
Its one finding was the accidental lockfile re-resolution; the reviewer confirmed
the restoration and reported no outstanding findings in that reviewed diff.
The later clean-kit staging addition received syntax, archive and actual deployed
closure checks. Landing and publication remain separate decisions.
