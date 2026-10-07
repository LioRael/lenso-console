import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, test } from "vitest";

import {
  deriveReadRefreshState,
  resolveReadRefreshPolicy,
} from "../../../../../../packages/console-authoring/src/read-refresh";

test("page overrides only declared fields and zero freshness is retained", () => {
  const global = Object.freeze({
    focus: "never",
    staleTimeMs: 10_000,
  } as const);
  const mount = Object.freeze({ focus: "stale", staleTimeMs: 30_000 } as const);
  const page = Object.freeze({ staleTimeMs: 0 });
  expect(resolveReadRefreshPolicy(global, mount, page)).toEqual({
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  expect(resolveReadRefreshPolicy(global, mount, { focus: "always" })).toEqual({
    refetchOnWindowFocus: "always",
    staleTime: 30_000,
  });
  expect(resolveReadRefreshPolicy(global, undefined, {})).toEqual({
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });
});

test("unspecified policy preserves existing Host query defaults", () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, staleTime: 10_000 },
    },
  });
  const observer = new QueryObserver(client, {
    ...resolveReadRefreshPolicy({}),
    initialData: "cached",
    queryKey: ["read-policy-default"],
  });
  try {
    expect(resolveReadRefreshPolicy({})).toEqual({});
    expect(observer.options.staleTime).toBe(10_000);
    expect(observer.shouldFetchOnWindowFocus()).toBe(false);
  } finally {
    observer.destroy();
    client.clear();
  }
});

test.each([
  ["never", 0, false],
  ["stale", Number.POSITIVE_INFINITY, false],
  ["stale", 0, true],
  ["always", Number.POSITIVE_INFINITY, true],
] as const)(
  "%s focus with freshness %s follows TanStack Query semantics",
  (focus, staleTimeMs, expected) => {
    const client = new QueryClient();
    const observer = new QueryObserver(client, {
      ...resolveReadRefreshPolicy({ focus, staleTimeMs }),
      initialData: "cached",
      queryKey: ["read-policy", focus, staleTimeMs],
    });
    try {
      expect(observer.shouldFetchOnWindowFocus()).toBe(expected);
    } finally {
      observer.destroy();
      client.clear();
    }
  }
);

test("invalid freshness cannot silently change the effective read policy", () => {
  for (const staleTimeMs of [-1, Number.NaN, Number.NEGATIVE_INFINITY]) {
    expect(() => resolveReadRefreshPolicy({ staleTimeMs })).toThrow(TypeError);
  }
});

test("first pending read blocks but an empty-data read error does not pretend to refresh", () => {
  expect(
    deriveReadRefreshState({
      data: undefined,
      isFetching: true,
      isPending: true,
    })
  ).toEqual({ blocking: true, hasData: false, refreshing: false });
  expect(
    deriveReadRefreshState({
      data: undefined,
      isFetching: false,
      isPending: false,
    })
  ).toEqual({ blocking: false, hasData: false, refreshing: false });
});

test.each([null, false, 0, "", []])(
  "cached data %j stays available during revalidation and after a failed refresh",
  (data) => {
    expect(
      deriveReadRefreshState({ data, isFetching: true, isPending: false })
    ).toEqual({ blocking: false, hasData: true, refreshing: true });
    expect(
      deriveReadRefreshState({ data, isFetching: false, isPending: false })
    ).toEqual({ blocking: false, hasData: true, refreshing: false });
  }
);
