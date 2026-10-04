/** Read freshness only; does not change query keys, mutation state or authorization. */
export interface ReadRefreshPolicy {
  focus?: "never" | "stale" | "always";
  staleTimeMs?: number;
}

/** Structurally compatible with existing TanStack Query read options. */
export interface ReadRefreshQueryOptions {
  refetchOnWindowFocus?: boolean | "always";
  staleTime?: number;
}

/** Page fields override mount fields, then global fields. Missing fields inherit. */
export function resolveReadRefreshPolicy(
  global: ReadRefreshPolicy,
  mount?: ReadRefreshPolicy,
  page?: ReadRefreshPolicy
): ReadRefreshQueryOptions {
  const focus = page?.focus ?? mount?.focus ?? global.focus;
  const staleTime =
    page?.staleTimeMs ?? mount?.staleTimeMs ?? global.staleTimeMs;
  const options: ReadRefreshQueryOptions = {};
  if (focus !== undefined) {
    switch (focus) {
      case "never": {
        options.refetchOnWindowFocus = false;
        break;
      }
      case "stale": {
        options.refetchOnWindowFocus = true;
        break;
      }
      case "always": {
        options.refetchOnWindowFocus = "always";
        break;
      }
      default: {
        throw new TypeError("Read refresh focus policy is invalid");
      }
    }
  }
  if (staleTime !== undefined) {
    if (Number.isNaN(staleTime) || staleTime < 0) {
      throw new TypeError("Read refresh stale time must be non-negative");
    }
    options.staleTime = staleTime;
  }
  // Omitting a field preserves the Host's existing QueryClient default.
  return options;
}

/** Derive read display state without changing cached data or reporting mutation success. */
export function deriveReadRefreshState(query: {
  data: unknown;
  isPending: boolean;
  isFetching: boolean;
}) {
  const hasData = query.data !== undefined;
  return {
    blocking: !hasData && query.isPending,
    hasData,
    refreshing: hasData && query.isFetching,
  };
}
