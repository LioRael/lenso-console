import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import {
  deriveReadRefreshState,
  type ReadRefreshPolicy,
  resolveReadRefreshPolicy,
} from "../../../../../../packages/console-authoring/src/read-refresh";

function deferred() {
  let complete!: (value: string) => void;
  let fail!: (reason: Error) => void;
  const promise = new Promise<string>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  return { promise, reject: fail, resolve: complete };
}

interface ReadPageProps {
  scope: string;
  policy: ReadRefreshPolicy;
  read: () => Promise<string>;
  mutate: () => Promise<string>;
  onMount: () => void;
}

// Synthetic business page: scope namespaces belong to the caller; policy only
// controls read freshness. This does not identify Relay's Loading cause.
function ReadPage({ scope, policy, read, mutate, onMount }: ReadPageProps) {
  const query = useQuery({
    queryKey: ["synthetic-read", scope],
    queryFn: read,
    ...resolveReadRefreshPolicy(policy),
  });
  const mutation = useMutation({ mutationFn: mutate });
  const state = deriveReadRefreshState(query);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    onMount();
  }, [onMount]);
  return (
    <section aria-label={`Workspace ${scope}`}>
      <output aria-label="Read status">
        {state.blocking ? "Loading first read" : "Read available"}
        {state.refreshing ? "; refreshing" : ""}
      </output>
      {state.hasData ? <p>{query.data}</p> : null}
      {state.blocking ? null : (
        <label>
          Unsaved draft
          <input
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
        </label>
      )}
      <button onClick={() => mutation.mutate()} type="button">
        Save change
      </button>
      <output aria-label="Mutation status">{mutation.status}</output>
      {mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
      {mutation.isSuccess ? <p>Saved change</p> : null}
    </section>
  );
}

function mounted(initial: ReadPageProps) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (props: ReadPageProps) =>
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <ReadPage key={props.scope} {...props} />
        </QueryClientProvider>
      )
    );
  render(initial);
  return {
    client,
    render,
    dispose() {
      root.unmount();
      client.clear();
      container.remove();
    },
  };
}

function foreground() {
  expect(document.visibilityState).toBe("visible");
  // TanStack Query's browser focus manager listens to this foreground event.
  window.dispatchEvent(new Event("visibilitychange"));
}

test("first read blocks; foreground refetch preserves cached data, draft and mounted input", async () => {
  const first = deferred();
  const refresh = deferred();
  const read = vi
    .fn<() => Promise<string>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValue(refresh.promise);
  const onMount = vi.fn();
  const view = mounted({
    scope: "member-a",
    policy: { focus: "always", staleTimeMs: Number.POSITIVE_INFINITY },
    read,
    mutate: async () => "saved",
    onMount,
  });
  try {
    await expect
      .element(page.getByRole("status", { name: "Read status" }))
      .toHaveTextContent("Loading first read");
    await expect
      .element(page.getByRole("textbox", { name: "Unsaved draft" }))
      .not.toBeInTheDocument();
    first.resolve("Cached member data");
    await expect.element(page.getByText("Cached member data")).toBeVisible();
    const input = page.getByRole("textbox", { name: "Unsaved draft" });
    await input.fill("unfinished edit");
    const original = input.element();
    foreground();
    await expect.poll(() => read.mock.calls.length).toBe(2);
    await expect
      .element(page.getByRole("status", { name: "Read status" }))
      .toHaveTextContent("Read available; refreshing");
    await expect.element(page.getByText("Cached member data")).toBeVisible();
    await expect.element(input).toHaveValue("unfinished edit");
    expect(input.element()).toBe(original);
    expect(onMount).toHaveBeenCalledTimes(1);
    refresh.resolve("Refreshed member data");
    await expect.element(page.getByText("Refreshed member data")).toBeVisible();
    await expect.element(input).toHaveValue("unfinished edit");
    expect(input.element()).toBe(original);
    expect(onMount).toHaveBeenCalledTimes(1);
  } finally {
    view.dispose();
  }
});

test("new scope starts empty and an old deferred read cannot populate its namespace", async () => {
  const oldRefresh = deferred();
  const newRead = deferred();
  const read = vi
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce("Private A data")
    .mockReturnValue(oldRefresh.promise);
  const props: ReadPageProps = {
    scope: "member-a",
    policy: { focus: "always", staleTimeMs: Number.POSITIVE_INFINITY },
    read,
    mutate: async () => "saved",
    onMount: vi.fn(),
  };
  const view = mounted(props);
  try {
    await expect.element(page.getByText("Private A data")).toBeVisible();
    foreground();
    await expect.poll(() => read.mock.calls.length).toBe(2);
    view.render({ ...props, scope: "member-b", read: () => newRead.promise });
    await expect
      .element(page.getByRole("status", { name: "Read status" }))
      .toHaveTextContent("Loading first read");
    await expect
      .element(page.getByText("Private A data"))
      .not.toBeInTheDocument();
    expect(
      view.client.getQueryData(["synthetic-read", "member-b"])
    ).toBeUndefined();
    newRead.resolve("Private B data");
    await expect.element(page.getByText("Private B data")).toBeVisible();
    oldRefresh.resolve("Late private A response");
    // The old read deliberately ignores cancellation and really completes.
    await expect
      .poll(() => view.client.getQueryData(["synthetic-read", "member-a"]))
      .toBe("Late private A response");
    expect(view.client.getQueryData(["synthetic-read", "member-b"])).toBe(
      "Private B data"
    );
    await expect.element(page.getByText("Private B data")).toBeVisible();
    await expect
      .element(page.getByText("Late private A response"))
      .not.toBeInTheDocument();
  } finally {
    view.dispose();
  }
});

test("read refresh completes without claiming success for a rejected mutation", async () => {
  const change = deferred();
  const read = vi.fn(async () => "Current read data");
  const mutate = vi.fn(() => change.promise);
  const props: ReadPageProps = {
    scope: "member-a",
    policy: { focus: "never", staleTimeMs: Number.POSITIVE_INFINITY },
    read,
    mutate,
    onMount: vi.fn(),
  };
  const view = mounted(props);
  try {
    await expect.element(page.getByText("Current read data")).toBeVisible();
    await page.getByRole("button", { name: "Save change" }).click();
    await expect
      .element(page.getByRole("status", { name: "Mutation status" }))
      .toHaveTextContent("pending");
    expect(mutate).toHaveBeenCalledTimes(1);
    await view.client.refetchQueries({
      queryKey: ["synthetic-read", "member-a"],
    });
    expect(read).toHaveBeenCalledTimes(2);
    await expect
      .element(page.getByRole("status", { name: "Mutation status" }))
      .toHaveTextContent("pending");
    await expect
      .element(page.getByText("Saved change"))
      .not.toBeInTheDocument();
    change.reject(new Error("Write refused"));
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Write refused");
    view.render({ ...props, policy: { focus: "always", staleTimeMs: 0 } });
    foreground();
    await expect.poll(() => read.mock.calls.length).toBe(3);
    await expect
      .element(page.getByRole("status", { name: "Mutation status" }))
      .toHaveTextContent("error");
    await expect
      .element(page.getByText("Saved change"))
      .not.toBeInTheDocument();
    expect(mutate).toHaveBeenCalledTimes(1);
  } finally {
    view.dispose();
  }
});
