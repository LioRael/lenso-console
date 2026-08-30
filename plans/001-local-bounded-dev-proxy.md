# Plan 001: Keep the privileged Console dev proxy local and bounded

> Drift check: `git diff --stat fda3fb9..HEAD -- package.json vite.config.ts src/dev`.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `fda3fb9`, 2026-08-30

## Why this matters

The Vite server binds all interfaces and, in live-host mode, exposes diagnostics and a
proxy that injects a server-owned Agent control token. It lacks peer/origin validation
and buffers request bodies without a limit.

## Current state

- `package.json:8` uses `vite --host 0.0.0.0`.
- `vite.config.ts:8-12` supplies live Host URL, diagnostics file, and Agent token.
- `src/dev/console-dev-vite-plugin.ts:72-85` proxies without request-authenticity checks.
- `src/dev/console-dev-vite-plugin.ts:174-210` injects credentials and buffers all bytes.

## Scope

In scope: dev scripts/config, dev middleware, environment documentation, and middleware
tests. Out of scope: production Rust service routes and production authorization.

## Steps

1. Add middleware tests for non-loopback peer, untrusted/missing Origin on privileged
   paths, body over limit, valid loopback control forwarding, and diagnostics access.
2. Bind loopback by default. Add one explicit remote-development opt-in with a safe
   name and fail activation when it lacks the required trusted-origin configuration.
3. Validate socket peer and Origin before reading/proxying; cap bytes while streaming
   and return a stable 413 without forwarding. Never expose the configured token.

## Verification

- `pnpm test:local` -> all pass.
- `pnpm typecheck:local && pnpm lint && pnpm build:local` -> exit 0.
- `git diff --check` -> no output.

## STOP conditions

Stop if Vite's request object does not expose a trustworthy socket peer in the test and
runtime versions; do not replace it with a caller-controlled forwarded header.
