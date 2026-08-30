# Plan 002: Batch Agent text deltas before React state updates

> Drift check: `git diff --stat fda3fb9..HEAD -- src/features/agent/agent-runtime.ts src/features/agent/use-agent-conversation.ts src/features/agent`.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `fda3fb9`, 2026-08-30

## Why this matters

Every SSE delta currently maps the full turn array and commits React state while
appending to a growing string. Long responses create avoidable main-thread work and
typing/render jank.

## Current state

- `agent-runtime.ts:247-260` invokes `onEvent` for every decoded frame.
- `use-agent-conversation.ts:209-218` immediately handles every event.
- `use-agent-conversation.ts:383-426` maps all turns and appends text per delta.
- Preserve terminal, tool, cancellation, and session-resolution ordering.

## Scope

In scope: Agent stream projection hook/helpers and focused tests. Out of scope: SSE wire
format, server coalescing, visual redesign, or changing persisted turn content.

## Steps

1. Add a long-stream test that sends many text/reasoning deltas and asserts content,
   terminal ordering, cancellation flush, and a bounded number of React state commits.
2. Buffer only text/reasoning deltas in refs keyed to the active turn; flush on
   animation frame or a short scheduler cadence. Flush synchronously before tool and
   terminal events and on cleanup.
3. Update the active turn by stable identity without altering unrelated turn objects;
   ensure no scheduled flush fires after abort/unmount.

## Verification

- `pnpm test:local -- use-agent-conversation` or the exact focused Vitest file -> pass.
- `pnpm test:local && pnpm typecheck:local && pnpm lint` -> exit 0.
- `git diff --check` -> no output.

## STOP conditions

Stop if batching changes the persisted event sequence or drops a final delta under
cancel/complete; characterize that lifecycle before optimizing further.
