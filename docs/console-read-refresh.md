# Console read refresh policy

Console keeps its existing default: reads are fresh for ten seconds and do not
refetch on window focus. Deployments can set the public Shell build option
`VITE_CONSOLE_READ_REFRESH_POLICY` to JSON:

```json
{
  "defaults": { "focus": "stale", "staleTimeMs": 10000 },
  "mounts": {
    "api-keys-alpha": { "focus": "never" },
    "api-keys-beta": { "staleTimeMs": 30000 }
  }
}
```

Mount keys are the exact catalog mount identity, not the plugin implementation
or URL. The Host applies the global defaults to its existing QueryClient and
passes the merged mount settings as `PageProps.readRefreshPolicy`. This is read
policy metadata; it does not change routes, service bindings or permissions.
Invalid configuration fails at startup. Rebuild the Shell to change this build
option; it is not a server secret or a new runtime configuration store.

Pages can override only the fields they need, using the existing Query hooks:

```tsx
import { deriveReadRefreshState, resolveReadRefreshPolicy } from "@lenso/console-sdk";

const query = useQuery({
  ...resolveReadRefreshPolicy(props.readRefreshPolicy ?? {}, undefined, {
    focus: "stale",
  }),
  queryKey: [props.mount.scopeKey ?? props.mount.id, "api-keys"],
  queryFn: readKeys,
});
const { blocking, refreshing } = deriveReadRefreshState(query);
if (blocking) return <LoadingKeys />;
if (query.data === undefined) return <ReadError error={query.error} />;
return <Keys data={query.data} refreshing={refreshing} />;
```

`mount.scopeKey` is the Host's existing authenticated mount cache namespace.
Legacy Hosts that omit it still require per-mount query keys and authoritative
session cache clearing. Preserve the Host's scoped service client and cancellation signal;
never use a constant shared key for two instances or authenticated scopes.
An empty array is valid cached data. Use an explicit `query.data === undefined`
check when other falsey values are valid for a read.

`focus: "never"` disables focus reads, `"stale"` refetches stale reads, and
`"always"` refetches even fresh reads. Per-field precedence is page, mount,
global; absent fields retain the QueryClient defaults. Explicit options on an
existing business hook keep their normal Query precedence. Adopt this seam in
that hook to make its policy configurable.

An initial pending read with no data can block. Revalidation with cached data
keeps the page and editable local state mounted, and can show a background
refresh indicator. A failed background read should expose the error while
retaining the prior data; do not clear the cache or key the page by fetching
status. Stable Host navigation, location and environment props avoid needless
effect restarts when their values have not changed.

Authentication and authorization remain authoritative: identity or scope
changes retire the previous mount, cancel reads and clear its query context.
An old response must not populate the new scope. Cached display retention
applies only within the same valid scope.

This policy does not control mutations or optimistic updates. Money, key and
permission changes report success only after the real action acknowledges it;
a pending or failed mutation cannot be represented as successful by a focus
refresh. The synthetic browser fixture proves Query and page lifetime behavior,
not the business API's production request semantics.
