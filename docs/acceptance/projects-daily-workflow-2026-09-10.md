# Projects daily workflow UI acceptance

The Connections page consumes optional AuthConnection account presentation from
Agent: App origin, authenticated subject ID, expiry and reconnect state. Older
providers without this field keep their existing display. Browser URLs remain
HTTPS or loopback-only and credentials never enter this projection.

Tool details expose returned Issue links, the recorded revision, and field
changes only when a complete pre-read matches the update's expected revision.
Failed, truncated or unmatched updates do not fabricate a before/after summary.
An explicit connection-required Tool error links to Connections.

Local checks passed: 260 unit tests, six focused browser tests, TypeScript,
production build and changed-file lint. The browser runner reports its existing
post-success ten-second close timeout; test assertions pass. React Doctor finds
pre-existing complexity in the touched activity and connection components; no
locale-dependent date rendering remains in the added presentation.

A separate real Projects App browser check verifies App login return, consent
login recovery, workflow update, revision conflict and refreshed activity. It
uses the actual Tool protocol without a language model. See the Agent source
acceptance record for the exact cross-repository inputs.

These are source changes. The published npm 1.11.0 cohort is unchanged. Account
metadata and returned Issue links require the matching Agent source/release;
the standalone Projects page requires the matching Projects Web Plugin in the
business App. This does not add Console embedding or an assignee inbox.
