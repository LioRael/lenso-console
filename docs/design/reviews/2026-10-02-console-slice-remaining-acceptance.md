# Console slice remaining acceptance

Recorded 2026-10-02. Branch `feat/pencil-console-pages`, base `7e2ed879c67c4267c595d7e06a0de3c465a37228`. Existing slice commits: Observe `d8ba3be`, generic Detail `61284e9`, Relay sidebar boundary `830d31f`. This is bounded local implementation and evidence; no remote CI, Delta review, landing, push, publication or deployment is claimed.

## Reference pixels: blocked, precise attempted path

The user selected Pencil node `TcZvX`. Library reference `libfile_3f7358361b188191aae4ca72ee6e0428`, `image(3).png`, image/png, 179308 bytes, 1470×994 is readable as metadata/asset pointer. The returned pointer is `sediment://file_000000006ec8823086e094924a1e6d8f`; the read did not include an MCP image block. Neither pointer nor OCR constitutes viewing pixels.

Fresh Library transfer preparation succeeded. The current official Library `library_file_transfer.py` resource was copied unchanged to a task-private Mac temporary directory and run with the complete prepared transfer, using its supported `materialize` command and this task's destination `.artifacts/design-reference/image(3).png`. It exited 1 with exactly:

```text
library file transfer failed: download failed
```

Helper SHA-256: `5c81478cd94a59d721a1677d0bd36f7cec23c18a21b48740b1c9ff94d27fb26f`. Latest helper directory: `/tmp/console-library-verify.BuJis5`. No signed URL was manually downloaded, helper implementation inspected, parent materialization copied, or `.pen` payload read.

Normal read-only Pencil MCP initialization/tools-call returned JSON-RPC error `-32603`:

```text
failed to connect to running Pencil app: desktop after 3 retries: transport not connected to app: desktop
```

Saved response: `/tmp/console-inventory-pencil-get_app_state.json`. Earlier attempts also timed out. Pencil was not repeatedly restarted and no system security process was touched. Node/component/variable reads require a connected app; none is reported as successful.

No actual pixel comparison or exact fidelity acceptance is claimed. The following is only a structural comparison against the parent's human description of the node:

| Reported design role | Current slice | Boundary |
| --- | --- | --- |
| Identity/revision/purpose/status and three tabs | Generic Plugin route, phase-labelled revision, existing metadata and activation status; Overview/Configuration/Dependencies | Implemented; exact visual fit unverified |
| Capabilities and runtime cards | Descriptor-backed capability IDs, execution metadata, phase; two installed Lenso Surfaces | Implemented; contribution detail unavailable |
| Health | Explicit Unknown | Intentional contract limit; inventory has no probe |
| Resources/access purpose | Explicit unavailable explanation | No physical resource/purpose contract; no guessed D1/KV |
| Change impact/provider/dependent edges | Declared required capability IDs with binding disclaimer | Resolved binding/impact graph unavailable |
| Validate/Preview disable write actions | No new action | Current owner has no such operation; existing configuration preview remains |

## Internal independent review and repairs

Internal read-only sub-agent `/root/review_console_slice` reviewed the exact slice and then the repair diff. This is not Delta review and no external Delta message was sent. Initial findings were:

1. P1: successful data remained visible after a later 403 because Query retains data after failed refetch. Fixed in the shared workbench data owner: current denial hides data immediately, a denial latch preserves hiding while cached queries are cancelled/removed, scoped history and ETag are cleared, and recovery waits for two fresh successes. The detail route also clears its cached drafts. Browser coverage exercises denial of either inventory or management, pending recovery, unconditional management read and cleared old draft; no writes occur.
2. P2: StrictMode effect replay reused an aborted contribution mount signal. Fixed in `MountedContribution`: each effect setup owns a fresh controller and Page waits for a live signal; cleanup aborts that controller. Observe cancellation guards remain. The new real outlet browser fixture checks a live signal under StrictMode and cancellation on unmount.
3. P2: Candidate capability facts could be paired with a Desired header revision. Fixed by deriving header phase/revision from `pluginTechnicalSelection`, with a separate different Desired revision. A decoder-backed fixture exercises no Active selection, candidate-A and desired-B.

Independent follow-up found no remaining blocker in the repaired source. A final bounded follow-up also checked that ordinary error retries inherit the existing QueryClient policy (including false/number/function), while 401/403 bypass automatic retry. It did not run browser/Rust tests itself. Observe source/live/cursor/late-response/trace-return review found no extra issue. A business/service denial fixture is not production Actor authorization proof.

## Current local receipts and time correction

Measured process timezone: `Asia/Shanghai` / China Standard Time, offset -480 minutes. Test “Start at” values below are local clock values from saved logs, converted to UTC; no exact test ending time is invented. The original `18:55 UTC` claim in the generic detail review was withdrawn while preserving the original source fingerprints and passing receipt.

| Check | Result | Saved log / start on 2026-10-02 |
| --- | --- | --- |
| API Plugin detail focused browser | 5 passed, exit 0 | `/tmp/plugin-detail-review-browser-fixed.log`; 19:14:54 CST = 11:14:54 UTC |
| Contribution mount + Observe focused browser | 13 passed, exit 0 | `/tmp/console-slice-lifecycle-browser.log`; 19:17:23 CST = 11:17:23 UTC |
| Workbench/request/i18n focused units | 17 passed, exit 0 | `/tmp/console-slice-review-unit.log`; 19:18:36 CST = 11:18:36 UTC |
| Updated header geometry/screenshots | 1 passed, 4 other tests skipped, exit 0 | `/tmp/plugin-detail-review-geometry.log`; 19:20:42 CST = 11:20:42 UTC |
| Existing App/plugin scope and locale journey | 1 passed, exit 0 | `/tmp/plugin-detail-review-scope.log`; 19:23:57 CST = 11:23:57 UTC |
| Final retry-policy change: cached permission recovery only | 1 passed, 4 other tests skipped, exit 0 | `/tmp/plugin-detail-review-retry-policy.log`; 19:26:22 CST = 11:26:22 UTC |
| Final local Shell bundle | Passed client/server + one prerendered page, exit 0 | `/tmp/plugin-detail-review-final-bundle.log` |
| Typecheck, changed-file oxlint/oxfmt, diff check | Passed | Focused local commands |

Browser results still emit `close timed out after 10000ms` after passing. A first repair browser run failed because its authored fixture used invalid configuration status `preparing`; changing it to the real `pending` status resolved that test. The failed log is retained at `/tmp/plugin-detail-review-browser.log`. No production fallback or contract relaxation was added. The complete 5-test API run preceded the final ordinary-retry-policy adjustment; only its affected permission test was repeated afterward. Unaffected source and earlier receipt hashes are retained.

Updated Overview screenshots at actual browser viewports 1440×900 and 390×844, both themes, were opened and inspected after the phase-labelled header change. Long identities and capability IDs wrap; narrow header actions remain below the identity; the two cards stack. They are the current route fixture screenshots under `apps/shell/src/features/plugins/__screenshots__/`, not full Shell captures or TcZvX pixel comparison. Vitest's saved image resolution differs from the measured browser viewport; the browser assertions explicitly check `window.innerWidth`.

Current reviewed source SHA-256:

| File | SHA-256 |
| --- | --- |
| Workbench data owner | `49e21b2b89a381126840f5263145a5309165694be3d7fb74679a5c8d57eeb65a` |
| Detail route | `1d994d757656bfb2675b1284d7df2c0cd9f46356cd76b5638ca8fb332686332f` |
| Inspector | `5901f2cd43a08ceb46b75f257a6ad35efada51cf523ea7ba136a21b3812cd4cb` |
| API browser proof | `7f7c00b05904efdbb527c48da4bdc12b52fb492e2f421ad9ca5af74f083ccc3b` |
| Contribution mount | `9eb3d41fddff2e9ff334ff97ac80e0a5a35cf2443a22dd88c8c2d863200eb91e` |
| Mount browser proof | `e2bdd113c0cde2d6abba80cfa3ea82907a6053b6f1e6fd1cbd13720e56728d3c` |

Receipt SHA-256: API browser `4ff5505894ed76b33e420a12eed660f60084ccd0cdb57dfe15a51287e6006787`; mount/Observe browser `caa40d9ee209edb300142ab95d2d6ae65ddf18a408c23309e296d3c5b36e6cde`; units `c004c0e42851addf64037acee469cf79af8cec4d34ce2809f544fa5abb6fd9a1`; earlier bundle `2f727d2341903466e0ea9588b65d3a8a7ac7e148c275cb06577f6b92bb76afc4`; final bundle `025527010187aaf0832665f410f7b5fbda2caf4fdfb6266c2a662a36de4101eb`; final permission regression `20f7ca945cf9f7eb8d18804fb4d785a41c0479099147ed723c0e5905a53d675b`.
Geometry receipt SHA-256 `30cdbbbb144c8b9b639f8a2dd32c0a1ac66824a98a2dd299fad7959fc55f9e53`; scope receipt `5d3727fa5b8ff4c9fec4f5e753184de8fd2644cc9815340ecf0907a8e1af2ad3`.

## Native next window: existing fa6 kit, not a new main runtime

The current branch still has the `7e2` runtime sources. No fa6 runtime/Host/support/CI owner files were imported or edited. Reusable qualified kit:

- Candidate `fa6e9081bb249a823c473efbbc075bdfcac0ebf2`, Core `eaa5bc489e8f8d245fd30821b4a4fbe1a9e35551`.
- Mac kit `/tmp/console-authoring-integration-20261002/kits-fa6e908/console-development-host-macos-15/development-host`.
- Archive SHA-256 `ea2426947935827e6c71d0582722e8c7dad01040030e7f2cac3cf9ad5ce7b013`.
- Native `console-host` SHA-256 independently read back as `a091bed82ced7ebb48c728a8e043d69dfc77fe106583bc6b86955224f83a8190`.
- Existing receipts: `/tmp/console-ci-cohort-workflow-20261002/runtime-fa6e908-final-handoff.md`, `fa6-macos-stream-binding.json`, and `fa6-macos-stream-DX-receipt.json`. The recorded kit has actual Native Request/page and macOS Stream qualification; no repeat of those unchanged gates is needed.

Minimum NEW acceptance fixture requires the following inputs before launch:

1. An immutable copy/hash manifest of this candidate's `apps/shell/dist/client`; configure the isolated App's Console `web_root` to that copy, keeping the sealed kit and support source unchanged.
2. A real, owner-exported read-only Plugin control target implementing inventory v2 and management v1, with exact origin/start command/cohort identity. Configure `managed_apps` in that isolated App. Auth and Observe sample identities from the browser fixture cannot be substituted for this target's actual inventory.
3. A browser driver limited to generic identity/phase facts, unavailable facts, both denied-read boundaries and navigation/configuration-read behavior. If the exported target lacks a controllable permission recovery fixture, report that part unverified rather than adding a permissive endpoint. No writes, new Actor/key or payment fixture.

The exact existing kit CLI sequence, after those inputs are frozen, is:

```sh
task_kit=/tmp/console-authoring-integration-20261002/kits-fa6e908/console-development-host-macos-15/development-host
task_app=/tmp/console-pencil-native-acceptance/app
PATH="$task_kit/bin" "$task_kit/bin/lenso" app create "$task_app" --console
# Fixture setup writes only this isolated App's Console configuration and copies the frozen Shell.
PATH="$task_kit/bin" "$task_kit/bin/lenso" app build --root "$task_app"
PATH="$task_kit/bin" "$task_kit/bin/lenso" app start --from "$task_app/dist" --check
PATH="$task_kit/bin" "$task_kit/bin/lenso" app start --from "$task_app/dist"
# Browser driver uses the actual printed loopback listener, then stops the task-owned Host.
```

These commands have NOT been executed for this slice. `task_app` is a proposed fresh fixture path, not an existing accepted package. Required control-target origin and driver do not yet exist in this task; there is no runnable completed Native acceptance fixture to claim. Budget roughly 30–45 minutes to prepare the bounded fixture after the owner exports that target, then 2–5 minutes for kit-only create/build/start plus 2–3 minutes of focused browser checks. The estimate derives from the existing kit consumer/Stream receipts and is not a runtime guarantee. Do not put Cargo/Rust on the kit-only PATH or invoke a full Rust rebuild.

Observe has an additional hard boundary: the kit's `host.json` native source composition admits `lenso.console.web` plus Web ingress companions; it does not link the native Observe provider. `plugins/observe/src/lib.rs` embeds `workspace.mjs` and CSS with `include_bytes!`. An existing Observe binary therefore cannot consume this module change by pointing at a new Shell. A real Observe + OTLP ingestion qualification requires its owning Native Host to export a compatible composition with these exact embedded assets, a source ID/state store/loopback OTLP fixture, and an immutable binary/descriptor/launch receipt. Coordinate that bounded relink with the runtime owner; no estimate for an unowned Rust build or false fa6 Observe claim is supplied. A Bun service-response fixture could prove Native transport only and would remain explicitly separate from real Observe/OTLP acceptance.

Relay sidebar filtering remains with the Relay UI owner through the existing contribution Sidebar slot. This branch contains only its boundary note. Pixel/Native/Delta/candidate gates remain separate unresolved facts; passing local tests is not completion of those gates.
