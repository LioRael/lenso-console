# Agent Console

An optional, locally composed Console plugin. The application installs its Agent
entry at the far left of the existing Dock; the Shell owns the separator,
composer morph, conversation tray, focus, escape handling and navigation return.
This package contains presentation and an HTTP client, not an Agent executor.
It is private and source-consumed in this workspace; it is not a published SDK.

## Explicit installation

```tsx
import { agentConsole } from "@lenso/agent-console/react";
import { createAgentConsoleClient } from "@lenso/agent-console/client";

// Keep the binding stable within one trusted Console session scope.
const agent = agentConsole({
  id: "application.agent",
  client: createAgentConsoleClient({
    basePath: "/agent",
    profile: "operator", // A profile actually installed by this application.
    fetch: authenticatedFetch, // Existing host transport, including CSRF policy.
  }),
  connection: {
    state: "ready", // Project actual host-owned configuration and authorization.
    provider: "Configured provider label",
    account: "Account display label",
    model: "Configured model label",
    scope: "Current application / target",
    // testedAt is optional evidence from a real host test, never inferred here.
    // usage: { label: "View provider usage", open: openExistingUsagePage },
  },
  configure: { label: "Agent settings", open: openExistingAgentSettings },
});

<ConsoleShell
  plugins={[...applicationPlugins, agent]}
  dock={{ leading: [{ bindingId: "application.agent", viewId: "agent" }] }}
  router={router}
  session={trustedSession}
/>;
```

The application must mount the real `lenso-agent` Fetch adapter at that prefix.
Its authenticated context derives subject, scope, application and target; the
server reauthorizes sessions and tool operations. Do not derive identity from
chat text or expose provider credentials to this plugin. A new identity/scope or
revocation must retire the trusted Shell session before exposing another one.
Recreating/removing the binding also discards its local state.

For reactive readiness, `connectionSource: { getSnapshot, subscribe }` can adapt
the application's existing connection store. Return a cached immutable snapshot
until that store changes. This replaces the static `connection` projection while
keeping the same binding and client. Selecting a model and returning from settings
can then enable the retained draft without silently submitting it. The source is
only presentation metadata; identity/scope changes still retire the Shell session.

The composed example accepts `agent?: AgentConsoleServices`. Its browser preview
installs a disconnected entry by default. `/orders?agent=replay` opts into the
explicitly labelled, synthetic `/agent-replay` fixture. This fixture never calls
a model or business tool. The ordinary TypeScript/compiled Console host does not
automatically install local `dockViews`; production applications must explicitly
compose this binding and their authorized transport. No production host or
provider registration is fabricated by this change.

## Readiness and drafts

The host projects `ready`, `disconnected`, `model-required`, `reauthorize`,
`revoked`, `disabled` or `unknown`. Each blocked state offers one existing host
configuration action, or directs the user to the application operator. Missing
client or selected model blocks submission; a client alone is not readiness.
Provider, account, model and scope labels can be inspected in Connection details.
Configured and provider-tested are distinct. Price and quota remain unknown;
an optional usage action opens the host's real usage surface.

The Agent HTTP API has no model/provider discovery or per-run model selector.
Selection and account reauthorization belong to the existing host provider
configuration. In particular, a token-management page in the sample is not
evidence that a model provider has been configured or tested.

Drafts and the current session ID live only in the retained Dock owner, within
the same trusted Shell session. Closing, changing routes and returning from host
settings preserve them. By default reload, removal and session retirement discard
them. There is no global sensitive-form cache. Do not enter
passwords or API keys into chat; this plugin offers no credential fields.

### Opt-in refresh recovery

The host can preserve **only a non-secret session ID** across browser refresh:

```ts
import { createAgentSessionResume } from "@lenso/agent-console/session-resume";

const resume = createAgentSessionResume({
  key: "application-agent", // Stable, explicit installation identity.
  storage: window.sessionStorage,
  scope: verifiedHostScope, // { getSnapshot, subscribe }, backed by host admission.
});
// Pass resume alongside client/connection to agentConsole({ id, ... }).
// Dispose on host teardown; notify the scope source of logout before teardown.
```

`verifiedHostScope.getSnapshot()` returns `{ session: ConsoleSessionAdapter,
projectId: string }`, or undefined. Use the same verified session passed to
`ConsoleShell`. Its `scopeKey` must change with authenticated subject, application,
target, project or authorization revision. The project ID must come from trusted
host admission, not a URL, chat message or local storage. Missing scope, an empty
project, a default `local` scope, or a non-ready session fails closed. Initial
authentication loading may retain the hint but permits no read until verified.

The adapter observes the host independently of whether the Dock has been opened.
Logout and known scope changes clear its one record. A fresh host compares its
verified scope fingerprint before using any saved ID. The bounded record contains
only a SHA-256 scope fingerprint and session ID; no identity labels, draft,
transcript, model request, token or Key is stored. This is a per-tab recovery hint,
not a session collection or authorization decision. The server still authorizes
every read and write. A forged ID cannot grant access.

Opening the Agent after refresh reads the saved session from its real service,
restores the conversation and follows an already-running run without submitting
another one. A missing session, denied access or lost connection blocks Send and
shows its actual state. Read retries are explicit. Starting a new conversation is
also explicit and preserves the current draft. Restoration never submits a draft,
replays a request key, confirms an action or calls a model automatically. Storage
failure can leave a conversation in memory only, with visible feedback.

Unsent text remains in memory and survives a failed restore in that page. It is
intentionally **not** recovered after a browser reload. Do not store sensitive
drafts to compensate. Identity/project retirement discards the previous UI owner.

## Agent contract

The client follows `LioRael/lenso-agent` at
`b1e7a3712872ab07d441130900d6abe8548a9d0e` (`src/types.ts` and Fetch adapter):

| Operation | Request |
| --- | --- |
| Create/read session | `POST /sessions {profile}`, `GET /sessions/:id` |
| Submit message | `POST /sessions/:id/runs {text}` with `Idempotency-Key` |
| Watch run | `GET /runs/:id/watch`, initial authoritative snapshot then SSE |
| Stop | `POST /runs/:id/cancel {}`; cancellation intent is not terminal completion |
| Approve/decline action | `POST /actions/:id/confirm {digest}` or `/cancel {}` |

SSE text comes from `text_delta.data.text`. `resnapshot_required` and interrupted
streams read the authoritative session, then offer explicit reconnect while a
run is still active. There is no durable `Last-Event-ID` replay assumption.
Closing the panel detaches the watcher; only Stop requests run cancellation.
Unknown submission outcomes retain the exact text and key for explicit retry.
No model write or action confirmation is automatically retried.

Pending actions can survive a completed run. Review shows the exact input,
precondition, target, effect and expiry, then sends the server's digest. Approval
refreshes the snapshot without assuming an `action_confirmed` event or starting
another model turn. `outcome_unknown` is displayed without a retry control.
Only user/assistant text and structured action status are rendered; arbitrary
tool-result envelopes are not printed as assistant messages. The owning service
remains responsible for canonical outcomes and secret redaction.

Responses, frames and input are bounded; session/run/action bindings are checked.
HTTP errors expose safe status/code, not raw provider causes. These client checks
do not replace server authorization, Origin/CSRF policy, output redaction or
explicit durable store initialization.

## Focused validation

From the repository root, with Bun 1.4.3 and the pinned Playwright installed:

```sh
bun run react:build
bun run --cwd packages/agent-console typecheck
bun run --cwd packages/agent-console test
bun run --cwd packages/agent-console test:browser
bun run check:composed
```

Client tests replay wire frames and admission outcomes. Browser tests run an
isolated loopback Vite host and synthetic protocol fixture, with fresh headless
Chromium contexts. They cover the actual compiled Shell and plugin, IME,
duplicates, navigation/draft return, cancellation, resnapshot, failed runs,
action review, narrow dark layout, reduced motion and page-content clearance.
These are not live-provider or real-tool evidence. To verify a production
installation, the application owner must additionally run its actual Agent
adapter with its authenticated host and explicitly selected provider/model.
