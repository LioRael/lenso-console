# Console slice final layout and actual Native attempt

Recorded 2026-10-02 on `feat/pencil-console-pages`, after `9522269c537fdd9abfb3600791261a3262ac96c8`. The parent viewed the new Library screenshot against TcZvX, accepted the main visual direction for real integration, and requested two final layout changes. Exact final pixel acceptance is still parent-owned.

## Final layout

The two Overview cards now stretch to the same row height, with real content unchanged. The detail page no longer imposes its own 920px centered ceiling: it retains the existing 24px desktop gutter and 16px narrow gutter inside the unchanged Shell. With Shell main x=304, the new heading starts at x=328 and the first card near x=335, versus the previous heading x=427. This reuses the current detail gutter and installed Tabs panel inset rather than adding another absolute anchor or changing shared Shell geometry. No health/resources/capabilities were fabricated.

The final Auth HTTP-fixture screenshot is PNG, 1470×994, 96,393 bytes; SHA-256 `8c68c3071df71e9fb7632a4095db64eac94549d06c52e303e89d7a13d6224d1d`. It was opened and inspected. The real Shell geometry test checks equal card top/height and the card's distance from the actual main container; the existing theme/narrow/focus/permission/navigation cases remain.

| Local check | Receipt |
| --- | --- |
| Focused Plugin Detail API browser | 6 passed, exit 0; `/tmp/console-plugin-detail-final-layout-browser.log`, start 20:03:17 CST = 12:03:17 UTC |
| After TypeScript-safe NodeList access adjustment | Real Shell geometry test 1 passed, 5 skipped, exit 0; `/tmp/console-plugin-detail-final-layout-geometry.log`, start 20:05:09 CST = 12:05:09 UTC |
| Typecheck, changed-file oxlint/oxfmt, diff check | Passed |
| Final Shell bundle | Client/server and one prerendered page passed, exit 0; `/tmp/console-plugin-detail-final-layout-bundle.log` |

The known browser cleanup warning remains. No full Rust suite or unchanged qualification gate was repeated.

## Actual isolated App

Using the existing fa6 kit at `/tmp/console-authoring-integration-20261002/kits-fa6e908/console-development-host-macos-15/development-host`, this task created `/tmp/console-pencil-native-acceptance-20261002`. The generated starter pages were moved to `starter-reference` in this new App, so no invented page provider or dependency download entered acceptance. The final built Shell was copied to `frozen-shell`, and the one App-owned `plugins/lenso.console.web/default.toml` selects its absolute `web_root`. The existing kit, owner sources and sealed packages were not edited.

Executed kit-only commands:

```sh
task_kit=/tmp/console-authoring-integration-20261002/kits-fa6e908/console-development-host-macos-15/development-host
task_app=/tmp/console-pencil-native-acceptance-20261002
"$task_kit/bin/lenso" app create "$task_app" --console
# Move this fresh App's generated starter aside; freeze Shell and set web_root.
PATH="$task_kit/bin:/usr/bin:/bin:/usr/sbin:/sbin" "$task_kit/bin/lenso" app discover --root "$task_app" --json
PATH="$task_kit/bin:/usr/bin:/bin:/usr/sbin:/sbin" "$task_kit/bin/lenso" app build --root "$task_app"
"$task_kit/bin/lenso" app check --root "$task_app/dist"
"$task_kit/bin/lenso" app show --root "$task_app/dist" --json
"$task_kit/bin/lenso" app start --from "$task_app/dist" --check
"$task_kit/bin/lenso" app start --from "$task_app/dist"
```

Build/check passed with 2 Instances (`lenso.console.web/default`, `lenso.web-ingress/default`) and 2 bindings (HTTP endpoint 1.1.0 and Stream endpoint 1.0.0 from ingress to Console). Readiness succeeded on port 51065 and stopped cleanly. The actual browser/HTTP window used port 51234; task session 11574 was stopped with Ctrl-C and returned `Local App stopped cleanly`, exit 0. No listener is intentionally retained.

All 88 frozen Shell file hashes were verified. `shell-manifest.json` SHA-256 is `dd92061b57d6666f018d2268c27074288f7460b602f173650ea4a4a88a14a695`. The actual copied Native binary is **`dist/.lenso/host`**, SHA-256 `a091bed82ced7ebb48c728a8e043d69dfc77fe106583bc6b86955224f83a8190`, matching the original kit. `dist/runtime/lenso-resolver` is the separate Engine/resolver, SHA-256 `97f9c803945cbb7c5613226411ec973c0b88909ea7fa5dba9bdb919c5ed72e24`; it must not be described as the Native Host.

## Actual operations and precise missing contracts

The following were read directly from Native HTTP, without request interception or mock responses. `native-http-reads.json` contains exact statuses and JSON.

| Native read | Observed result |
| --- | --- |
| `/api/console/v1/session` | 200, local mode; management_enabled and human_management_enabled false |
| `/api/console/v1/apps` | 200; only console-extensions, pluginConfiguration false, no Agent or local bundle install |
| `/api/console/v1/agents` | 200; empty |
| `/api/console/v1/pages` and `/surfaces` | 200, console.page-catalog/1, mounts empty |
| `/api/console/v1/management/catalog` | 404, no bound management provider |
| `/api/console/v1/apps/console-extensions/plugins` and `/control/plugins` | 404, App management target was not found |
| `/api/lenso/v1/plugins` and `/control/plugins` | 404 |

The actual `dist/.lenso/host-build.json` catalog confirms only Console Web and ingress are linked. HTTP exposes describe/handle and Stream exposes describe_stream/handle_stream. Optional management/contribution requirements exist but have no selected provider.

Positive generic Plugin Detail requires a real owner-exported managed App: clean loopback origin exposing GET `/api/lenso/v1/plugins` (inventory v2) and GET `/api/lenso/v1/control/plugins` (management v1), selected through Console's existing typed `managed_apps` configuration. Needed inputs are exact origin/start command/cohort identity and existing Host-owned authorization configuration; no Agent or invented public endpoint is required. Permission-revocation/recovery qualification also needs the target's real controllable denial boundary. The fa6 App currently supplies none of these.

Positive Observe requires a different compatible Host that actually links `lenso.console.workspace.observe`, UI contribution/workspace-service roles, the exact changed embedded `workspace.mjs`/CSS, query descriptor 1.1.0 and its operations, plus a real source ID/store and loopback OTLP ingestion fixture. This kit has no Observe module/mount/service. Merely replacing Shell `web_root` cannot replace Rust `include_bytes!` assets. No real Observe request, trace/log/cursor stream or OTLP ingestion acceptance was claimed.

## Native browser failure: concurrent assets

The browser used the real Native listener and no request interception. The Native root index bytes matched the frozen Shell index. However a cold browser module load did not render navigation: multiple JS/CSS assets returned **503 `{"error":"endpoint_unavailable"}`**, leaving the real `Loading Console` page. The browser receipt is explicitly `passed:false`, positive_plugin_detail:false, positive_observe:false, writes:0. Failure screenshot and console/request errors are retained under `browser/`; zero pageerrors does not make this a passing check.

Single direct reads of the same CSS/JS assets returned 200 with correct MIME types. One focused diagnostic sent four concurrent reads of the same JS asset: one 200, three 503 with the above body. This is consistent with the exact compiled HTTP capability admission in `host-build.json`: `queue_capacity=0`, `max_concurrency=1`, no operation override; the separate Stream capability has the same defaults. Console's external `web_root` path awaits filesystem reads, so overlapping browser loads can occupy this admission slot. No internal RuntimeFailure trace was captured, so the precise scheduler failure is inferred from the observed response pattern and descriptor, rather than claimed as traced.

This admission belongs to the Plugin/Host descriptor, not the App's typed Console configuration. No schema field permits this App to replace it. Fix/export a compatible qualified Host through its owner, then rerun this exact cold-browser path. Do not mutate the sealed kit, add a proxy/interceptor/serialized browser loader, warm browser cache to conceal failure, relax authorization, or count the HTTP-fixture screenshot as Native proof.

Read-only Native owner thread inspection found the separate Relay sidebar package `/tmp/relay-sidebar-20261002/package` and its existing qualified synthetic Native receipt. It is a Relay package with its own backend/UI, not a fa6 generic Plugin-control or Observe export; it was not started or altered and its old checks were not repeated.

Direct coordination messages to the specified owner were rejected by automatic approval review, first for disclosure of internal paths/commit/integration details and then even for a minimal entrypoint/time-window request because it did not recognize trusted human authorization for that destination. No message was delivered and no indirect workaround was used. The caller must obtain recognized authorization before another owner message; independent work above was completed.

## Receipts and next runnable window

| Source / receipt | SHA-256 |
| --- | --- |
| Inspector | `548ab09f9e8d27a964dacef1ba591e7e3e5523967a7e628e802ded8c258db541` |
| Overview | `7325776b04e7f7f640af5e3a6d571546a65307584157ac6c3af0207c26209eed` |
| Browser proof | `dc8f7b056692941a8aab52d982dcffc6562df9c433b7c857bf01f72072534849` |
| 6-test browser receipt | `d3eb10afe143b4ba59fbdb07789f848d3dbc1e880c7a6e065738624ee1f2789e` |
| Final geometry receipt | `9df626a6b30086d2eea4c10e13adf6d2f7a41bf6b944eb0eae769c619747cc68` |
| Bundle receipt | `3aa0e24ea5e771d7a305bc456c74bec9f2a46f1dd90c17806ba3c153e8e442e0` |
| Native HTTP reads | `32dbb65a7753ca195a9d836ab8a8d69390a370c7c7a7dbb851d516f3678ae17b` |
| Failed Native browser receipt | `414c8e1e4189d07b3f47b7cfab15c243b772bda4d8c1cc4488dcfbcbf5d9a218` |

Executable driver: `.artifacts/native-console-final-shell.mjs` in this worktree; diagnostics and frozen App: `/tmp/console-pencil-native-acceptance-20261002`. The existing driver records failures and must be rerun with the printed listener only after the owning Host has resolved admission; extend it to actual inventory/detail/Observe checks only when the real exports above exist. Native permission/Observe/OTLP acceptance, Delta review, exact-candidate remote CI, landing, push and publication remain uncompleted. No new keys, provider API calls, payment, main change, deployment or broad Rust build occurred.
