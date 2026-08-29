# Lenso Console

[![CI](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml)

Agent-focused Lenso Console. This repository owns the TanStack Start app and
server-side bridges to the Agent Harness.

The Console server proxies Agent API requests to one loopback Agent Harness.

## Repository shape

- Lenso Console: this repository owns the Console app, Agent Control route, and
  delivery gates.
- Lenso framework: [`LioRael/lenso`](https://github.com/LioRael/lenso) owns the
  independent Plugin Plan and Kernel runtime.

Keep both repositories checked out as siblings for backend-backed Console work:

```text
framework/
  lenso/
  lenso-console/
```

Repository operations notes, including branch protection and backend checkout secrets, live in [docs/repository-operations.md](docs/repository-operations.md).

## Run the Console

```bash
pnpm install
pnpm build
LENSO_CONSOLE_AGENT_URL=http://127.0.0.1:8788 \
LENSO_CONSOLE_AGENT_CONTROL_TOKEN=replace-with-the-harness-control-token \
pnpm start
```

Open:

```text
http://localhost:3030
```

## Shell development

Run TanStack Start through Vite when working on the Shell with hot reload:

```bash
pnpm dev
```

Set `LENSO_CONSOLE_AGENT_URL` and `LENSO_CONSOLE_AGENT_CONTROL_TOKEN` in the
server environment to connect the local Harness. Browser traffic remains
same-origin; the control token is never included in client assets.

## Architecture

- `src/routes` and `src/router.tsx`: TanStack Start SPA file routes, document shell, and the single router factory; `src/app`: root providers and route lifecycle states.
- `src/components/runtime`: Console Shell and shared presentation components.
- `src/hooks`: Shell and Agent interaction hooks.
- `src/lib`: query and API configuration helpers.
- `src/server`: bounded server-only bridges for Agent runtime and Tool Policy requests.
- `src/features`: route-level Console screens and product data.

### Agent surfaces

The Shell provides the Agent workflow through the configured Agent Harness.

- `/`: new task composer and first-use examples.
- `/agent/:chatId`: conversation, trajectory, Tool activity, and chat history.
- `/settings/agent`: Agent Tool Policy controls backed by the Agent Harness.


## Checks

The console uses Ultracite with the Oxlint/Oxfmt provider:

- `oxlint.config.ts` extends `ultracite/oxlint/core`, `ultracite/oxlint/react`, and `ultracite/oxlint/tanstack`.
- `oxfmt.config.ts` extends `ultracite/oxfmt`.
- No ESLint, Prettier, or Biome stack is configured.

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm check
```
