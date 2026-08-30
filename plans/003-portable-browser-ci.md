# Plan 003: Run real portable Console browser tests in CI

> Drift check: `git diff --stat fda3fb9..HEAD -- package.json pnpm-lock.yaml vitest.browser.config.ts .github/workflows/ci.yml src`.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-local-bounded-dev-proxy.md`, `plans/002-batched-agent-stream.md`
- **Category**: tests
- **Planned at**: commit `fda3fb9`, 2026-08-30

## Why this matters

The browser suite hard-codes a macOS Chrome executable, passes with no tests, and is not
part of CI. Browser interaction, focus, animation, and streaming regressions currently
have no real Chromium gate.

## Current state

- `package.json:12,21-23` keeps browser tests outside `check`.
- `vitest.browser.config.ts:21-32` hard-codes Chrome and sets `passWithNoTests`.
- `.github/workflows/ci.yml:27-30` runs only `pnpm check`.

## Scope

In scope: browser config/scripts, CI workflow, lockfile if required, and a small critical
browser test set. Out of scope: exhaustive visual snapshots or cross-browser matrix.

## Steps

1. Use Playwright-managed Chromium by default with an optional local executable override;
   remove `passWithNoTests`.
2. Add real tests for one keyboard/focus path, the guarded dev-proxy surface where
   browser-observable, and streamed conversation completion/content ordering.
3. Install Chromium in CI and run `pnpm test:browser` as a required quality gate.

## Verification

- `pnpm exec playwright install chromium` -> exit 0.
- `pnpm test:browser` -> nonzero test count, all pass.
- `pnpm check` -> exit 0.
- `git diff --check` -> no output.

## STOP conditions

Stop if a test requires external network or real credentials; replace it with the
existing mock/dev transport boundary.
