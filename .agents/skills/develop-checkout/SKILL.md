---
name: develop-checkout
description: Prepare this source checkout and run its existing isolated development checks.
---

From the checkout root, run `.agents/dependencies` with existing tools, or
`.agents/setup` on a Linux x86-64 Delta runner. Source `. .agents/env` in each
new terminal; PATH changes from setup do not persist into later terminals.

Focused source smoke: `bun run sdk:build && bun run plugins:build && bun run sdk:preview`.
This is a focused development check, not the full existing CI/land gate.
For the maintained browser entry, use `start-preview`.
