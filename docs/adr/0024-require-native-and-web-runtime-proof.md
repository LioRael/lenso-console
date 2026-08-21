---
status: accepted
---

# Require native and Web runtime proof

Console cannot claim one portable Module UI artifact from compilation alone.
Before production commitment, the exact same Component digest must execute
through the supported native and browser Component hosts, drive the same
transition fixtures, and render and interact through GPUI and gpui_web. The
proof must exercise initialization, events, effects, invalid trees, resource
budgets, IME and focus, accessibility, virtual collections, streams, Target App
switching, candidate readiness, generation activation, and rollback.

Supported operating systems, browsers, rendering backends, threading modes, and
accessibility levels are declared only from passing runtime evidence. A browser
failure does not authorize a hidden React, DOM, or WebView fallback; it blocks
the affected Console target or returns the architecture decision for review.

## Consequences

GPUI Web and browser Component Model maturity are explicit feasibility risks.
The first implementation milestone is a vertical conformance slice rather than
a broad page rewrite, and release gates retain the exact artifact, environment,
screenshots, interaction traces, diagnostics, and cross-runtime results.
