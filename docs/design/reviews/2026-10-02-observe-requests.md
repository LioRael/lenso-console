# Observe Requests recovery and pagination

## Scope and reference

- Base: `7e2ed879c67c4267c595d7e06a0de3c465a37228`, isolated branch `feat/pencil-console-pages`.
- Owner: existing Observe workspace, `plugins/observe/workspace.mjs` and its scoped CSS. Shell presentation and shared Lenso UI are unchanged. A follow-up repairs the shared contribution mount's StrictMode cancellation lifecycle without changing its presentation; see [remaining acceptance](2026-10-02-console-slice-remaining-acceptance.md).
- This slice was explicitly approved while the Pencil reference was unavailable. It preserves the existing Observe design and is not a new Pencil page implementation.
- Navigation: latest requests, opaque cursor pages, trace detail, and return to the originating request page. The mount contract owns route updates.
- Data: existing admitted `observe` workspace service, `lenso.observability.query@1`, descriptor version 1.1.0. Browser proof uses the real workspace service client with isolated HTTP/SSE response fixtures; no Native Host or OTLP ingestion claim.

## Behavior

- A request snapshot stays stable when live events arrive. The page announces new or lagged telemetry and offers refresh instead of displacing snapshot rows before cursor pagination.
- Cursor expiry has a bounded latest-page recovery action. A failed same-scope refresh retains useful data. Trace retention failure and correlated log failure are separate states.
- App/service identity changes abort old reads and streams and clear old data. Permission denial stops the feed and removes cached authorized content, including during an access retry.
- Returning from a trace restores its request cursor and keyboard focus to the originating row.

## Geometry and rendered checks

- Desktop 1440×900 and narrow 390×844, light and dark: pass. Header, health and pagination controls wrap; no horizontal overflow. Request text aligns with the existing grid. CSS owns each separator once.
- Existing pill controls use Observe's token-based surface, border, hover and focus styles. Hover and keyboard focus keep control geometry stable; focus stays visible.
- Loading, empty, refresh failure/retry, expired cursor, trace not found, logs failure/retry, denied access, same-source revocation and source change: covered by focused browser checks. The list has 50-item cursor pages and long route cursors in fixtures.
- Screenshot artifacts (ignored local evidence): `apps/shell/src/features/extensions/__screenshots__/observe-requests-{light,dark}-{1440,390}.png`. These are rendered workspace fixtures without the full Console Shell.
- Menus/overlays: not applicable; none added.

## Verification

- `VITE_CONSOLE_DX_SCREENSHOTS=1 pnpm --dir apps/shell exec vitest run --config vitest.browser.config.ts src/features/extensions/observe-workspace.browser.test.tsx`: 7 passed, 2026-10-02. Exit 0; Vitest reports a 10-second server shutdown timeout after successful results.
- `pnpm typecheck:local`: passed.
- Focused `oxlint --deny-warnings`, `oxfmt --check`, `node --check plugins/observe/workspace.mjs`, and `git diff --check`: passed.
- Environment: Node 26.10.0, pnpm 11.5.0, Vitest 4.1.10, Playwright 1.62.1 Chromium.
- No Rust, remote CI, landing, publication, deployment, key creation or payment occurred. Remote candidate validation remains a separate landing requirement.

Source SHA-256 at validation:

| File | SHA-256 |
| --- | --- |
| Observe module | `25dfe189a90efe25e9904116a64d6b55452ec002cf9679002fa94c89a265d508` |
| Observe CSS | `c02d0ddd6ad0217a764aab58f4ce16239e9426b5be6ed4900cd6b652be6610f4` |
| Browser proof | `5c52317c30e68eed839297b843c5df9cb5a706a55476eba26cf51658e3f809c5` |
