# Scoped Console reads

Pages can keep safe server DTOs across navigation through the Console SDK. The
Host uses its existing TanStack Query client; pages receive no global client,
cache setters, persistence, or mutation caching.

```tsx
import { useWorkspaceRead, useWorkspaceReadClient } from "@lenso/console-sdk";

const reads = useWorkspaceReadClient();
const requests = useWorkspaceRead({
  key: "requests.list",
  params: { cursor, filters },
  read: ({ params, signal }) => api.listRequests(params, { signal }),
  policy: { staleTimeMs: 10_000, gcTimeMs: 300_000, remount: "stale" },
});

// Only a real successful write ACK starts read invalidation. Mutation state and
// one-time credentials belong to the page, independently of read refresh state.
const save = async (change: RequestChange) => {
  await api.updateRequest(change);
  await reads.invalidate({ key: "requests.list" });
};
```

`key` is a stable business read name; every input affecting its result belongs in
`params`. Parameters are copied before use. Object key order follows TanStack's
normal hashing. Supplying `params` to `invalidate` selects that exact variant;
omitting it selects only that read's variants in the current scope. The existing
`useWorkspace().reads` / `PageProps.reads` injection remains available; older
Hosts without it fail explicitly when the new hook is used.

The Host prefixes keys with its origin, admitted Auth authority/realm/audience
digest, permission epoch, and existing mount scope (instance, subject, owner,
revision, implementation and service requirements). Authors do not supply this
security namespace. A legacy trusted Auth binding uses its issuer authority;
the Operators realm additionally uses its configured realm and trust key.
Unverified `claims.realm` never selects the realm. Session metadata excludes
proofs, credential evidence and assertion renewal times. Signed identity claims
and Console's existing admitted permission snapshot retire cache scopes when
they change. Normal proof renewal preserves the cache.

Logout, denied sessions and permission transitions reuse existing clear paths.
The single QueryClient cancels reads and advances its epoch before clearing.
Old signals/epochs cannot return data or invalidate a newly admitted scope,
even if a transport ignores cancellation. Auth scope metadata comes only from
an admitted session response (`x-lenso-read-scope`), never a page option.

Scope digests are opaque, not sortable revisions. A different valid digest on
an admitted same-origin API response retires its current epoch and requests an
authoritative session revalidation; the response itself cannot admit the new
digest. Epoch and abort checks reject concurrent late responses, so an old
digest cannot roll back the current scope. Object-level 403 responses request
revalidation without automatically logging out or discarding a valid account's
drafts. Failed/changed session admission retires the affected private scope.

An SDK `WorkspaceServiceError` with status 403 also removes the exact denied
business read's previous DTO without clearing other keys or the account. Active
observers remain masked and require an explicit successful read to re-admit that
object. A temporary 503 keeps safe previous data. Denial does not trigger
automatic retries even if the host's general retry policy is unlimited.

An open, visible Shell revalidates the session on a bounded 60-second interval,
with a 15-second request timeout, as well as its existing focus/account events.
Admitted external workspace sources have the same bounded authority check and
independent lifetime. This provides bounded visibility of idle revocation
without adding a push channel. Background/browser suspension can delay timers;
backend authorization is rechecked on every operation and remains the security
boundary.

The cache is memory-only. Fresh navigation returns use cached data immediately;
stale returns retain data during background refresh. Only an initial pending
read without data sets `blocking`; `refreshing` never indicates write success.
Data is a copied, deeply read-only snapshot. Form drafts are separate local state
and must not mutate the server DTO. Completed data remains after page unmount;
in-flight page reads are cancelled through Query's signal plus the mount signal.

Policies inherit **page > mount > global**, one field at a time. The existing
`focus` and `staleTimeMs` meanings are unchanged. `gcTimeMs` controls inactive
cache retention and `remount` uses the same `never` / `stale` / `always` values
as `focus`. Omitted fields preserve TanStack defaults (stale remounts and five
minutes of inactive retention). Multiple observers of one key follow TanStack's
longest-retention rule. Public build configuration stays
`VITE_CONSOLE_READ_REFRESH_POLICY` with `defaults` and exact mount-ID `mounts`.

Read callbacks must return **safe JSON DTOs from explicitly read-only resources**.
Do not pass create/reveal/rotate credential operations. Keys reads return metadata
(`id`, `prefix`, `fingerprint`, `last4`, etc.); one-time plaintext belongs in
separate ephemeral mutation state. The SDK snapshots declared read DTOs without guessing privacy from field names.
Resource contracts/projections exclude
credentials from read DTOs and parameters. There is no automatic mutation
caching, disk/session/localStorage cache or dehydration.
