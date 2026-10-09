import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import {
  useWorkspaceRead,
  WorkspaceScope,
  useWorkspaceReadClient,
  type PageProps,
} from "../../../../../../packages/console-authoring/src/index";
import type {
  WorkspaceReadOptions,
  WorkspaceReadResult,
} from "../../../../../../packages/console-authoring/src/read";
import { WorkspaceServiceError } from "../../../../../../packages/console-authoring/src/transport";
import { ConsoleQueryClient } from "../../lib/console-query-client";
import { createWorkspaceReads } from "./workspace-read-client";

function deferred<Value>() {
  let complete!: (value: Value) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<Value>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  return { promise, resolve: complete, reject: fail };
}

type Options = WorkspaceReadOptions<{ cursor: string }, { message: string }>;

function ReadPage({
  options,
  write,
  observe,
}: {
  options: Options;
  write?: () => Promise<string>;
  observe?: (result: WorkspaceReadResult<{ message: string }>) => void;
}) {
  const result = useWorkspaceRead(options);
  useEffect(() => {
    observe?.(result);
  }, [observe, result]);
  const reads = useWorkspaceReadClient();
  const [draft, setDraft] = useState("");
  const [writeStatus, setWriteStatus] = useState("idle");
  const [plaintext, setPlaintext] = useState<string>();
  const save = async () => {
    setWriteStatus("pending");
    try {
      const acknowledgement = await write?.();
      setPlaintext(acknowledgement);
      await reads.invalidate({ key: options.key });
      setWriteStatus("saved");
    } catch {
      setWriteStatus("refused");
    }
  };
  return (
    <section>
      <output aria-label="Read state">
        {result.blocking ? "Loading" : "Available"}
        {result.refreshing ? "; refreshing" : ""}
      </output>
      {result.data ? <p>{result.data.message}</p> : null}
      {result.error ? <p role="alert">{result.error.message}</p> : null}
      <label>
        Draft
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      {write ? (
        <button type="button" onClick={() => void save()}>
          Save
        </button>
      ) : null}
      <output aria-label="Write state">{writeStatus}</output>
      <output aria-label="One-time key">{plaintext}</output>
    </section>
  );
}

function mounted() {
  const client = new ConsoleQueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.admitReadScope("a".repeat(64));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let controller: AbortController | undefined;
  let props: PageProps | undefined;
  let result: WorkspaceReadResult<{ message: string }> | undefined;
  const binding = (mount = "alpha") => {
    controller = new AbortController();
    const scopeKey = JSON.stringify([
      mount,
      `example/${mount}`,
      "revision-1",
      "implementation-1",
      "same-named-user",
    ]);
    const reads = createWorkspaceReads(client, {
      scopeKey,
      signal: controller.signal,
      policy: { focus: "never", staleTimeMs: 10_000 },
    });
    props = {
      params: {},
      environment: { locale: "en", theme: "light" },
      location: { hash: "", search: "", segments: [] },
      mount: {
        id: mount,
        scopeKey,
        title: mount,
        revision: "revision-1",
        owner: { instance: `example/${mount}` },
        subject: { kind: "console" },
      },
      navigation: {
        go: () => undefined,
        href: () => "/",
        openWorkspace: () => undefined,
      },
      signal: controller.signal,
      services: {
        invoke: async () => {
          throw new Error("unused");
        },
        subscribe: () => {
          throw new Error("unused");
        },
      },
      reads,
    };
    return reads;
  };
  const render = (options: Options, write?: () => Promise<string>) => {
    if (!props) {
      binding();
    }
    const value = props as PageProps;
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <WorkspaceScope value={value}>
            <ReadPage
              options={options}
              observe={(readResult) => {
                result = readResult;
              }}
              {...(write ? { write } : {})}
            />
          </WorkspaceScope>
        </QueryClientProvider>
      )
    );
  };
  const leave = () => {
    controller?.abort();
    flushSync(() => root.render(<p>Another page</p>));
    props = undefined;
  };
  return {
    client,
    render,
    leave,
    binding,
    refetch() {
      if (!result) {
        throw new Error("Read page is not mounted");
      }
      return result.refetch();
    },
    dispose() {
      leave();
      root.unmount();
      client.clear();
      container.remove();
    },
  };
}

// The earlier refresh fixture uses page-owned keys and never unmounts/returns through
// the public SDK. This catches loss of Host-owned cache and parameter collisions.
test("returning pages reuse scoped reads; stale reads keep data and drafts; parameters and GC remain distinct", async () => {
  const refresh = deferred<{ message: string }>();
  const read = vi
    .fn<Options["read"]>()
    .mockResolvedValueOnce({ message: "Cached Alpha" })
    .mockReturnValue(refresh.promise);
  const options: Options = {
    key: "requests.list",
    params: { cursor: "first" },
    read,
  };
  const view = mounted();
  try {
    view.render(options);
    await expect.element(page.getByText("Cached Alpha")).toBeVisible();
    view.leave();
    view.render(options);
    await expect.element(page.getByText("Cached Alpha")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(1);
    view.leave();
    view.render({ ...options, policy: { staleTimeMs: 0, remount: "stale" } });
    await expect
      .element(page.getByRole("status", { name: "Read state" }))
      .toHaveTextContent("Available; refreshing");
    const draft = page.getByRole("textbox", { name: "Draft" });
    await draft.fill("unfinished edit");
    const original = draft.element();
    refresh.resolve({ message: "Refreshed Alpha" });
    await expect.element(page.getByText("Refreshed Alpha")).toBeVisible();
    await expect.element(draft).toHaveValue("unfinished edit");
    expect(draft.element()).toBe(original);
    const second = deferred<{ message: string }>();
    const secondRead = vi.fn(() => second.promise);
    view.render({
      ...options,
      params: { cursor: "second" },
      read: secondRead,
      policy: { gcTimeMs: 0 },
    });
    await expect
      .element(page.getByRole("status", { name: "Read state" }))
      .toHaveTextContent("Loading");
    await expect
      .element(page.getByText("Refreshed Alpha"))
      .not.toBeInTheDocument();
    second.resolve({ message: "Second cursor" });
    await expect.element(page.getByText("Second cursor")).toBeVisible();
    expect(secondRead).toHaveBeenCalledOnce();
    view.leave();
    await vi.waitFor(() =>
      expect(view.client.getQueryCache().getAll()).toHaveLength(1)
    );
  } finally {
    view.dispose();
  }
});

// Cache reuse and global admission tests above do not cover an object's access
// changing within the same session. A failed refresh must not retain its DTO.
test("object denial removes only its snapshot; explicit retry readmits without losing drafts or accepting late reads", async () => {
  const late = deferred<{ message: string }>();
  const denied = deferred<{ message: string }>();
  const admitted = deferred<{ message: string }>();
  const returned = deferred<{ message: string }>();
  const forbidden = new WorkspaceServiceError(
    "Object access denied",
    "forbidden",
    403
  );
  const read = vi
    .fn<Options["read"]>()
    .mockResolvedValueOnce({ message: "Protected object" })
    .mockRejectedValueOnce(
      new WorkspaceServiceError("Service unavailable", "unavailable", 503)
    )
    .mockReturnValueOnce(late.promise)
    .mockReturnValueOnce(denied.promise)
    .mockReturnValueOnce(admitted.promise)
    .mockRejectedValueOnce(forbidden)
    .mockReturnValue(returned.promise);
  const options: Options = {
    key: "objects.get",
    params: { cursor: "private" },
    read,
    policy: { focus: "always" },
  };
  const view = mounted();
  try {
    const otherRead = vi.fn(async () => ({ message: "Unrelated object" }));
    view.render({
      ...options,
      params: { cursor: "unrelated" },
      read: otherRead,
    });
    await expect.element(page.getByText("Unrelated object")).toBeVisible();
    view.render(options);
    await expect.element(page.getByText("Protected object")).toBeVisible();
    const draft = page.getByRole("textbox", { name: "Draft" });
    await draft.fill("unfinished edit");
    const input = draft.element();
    await expect(view.refetch()).rejects.toMatchObject({ status: 503 });
    await expect.element(page.getByText("Protected object")).toBeVisible();

    // Even an unlimited Host retry policy cannot retry an authoritative denial.
    view.client.setDefaultOptions({ queries: { retry: true, retryDelay: 0 } });
    view.render(options);
    const canceled = (async () => {
      try {
        await view.refetch();
      } catch {
        // Superseded reads may reject, but must never repopulate the cache.
      }
    })();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    const refusal = view.refetch();
    const rejected = expect(refusal).rejects.toBe(forbidden);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(4));
    denied.reject(forbidden);
    await rejected;
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Object access denied");
    await expect
      .element(page.getByRole("status", { name: "Read state" }))
      .toHaveTextContent("Available");
    await expect
      .element(page.getByText("Protected object"))
      .not.toBeInTheDocument();
    await expect.element(draft).toHaveValue("unfinished edit");
    expect(draft.element()).toBe(input);
    const cached = () =>
      view.client
        .getQueryCache()
        .getAll()
        .map((entry) => entry.state.data);
    await vi.waitFor(() => {
      expect(cached()).not.toContainEqual({ message: "Protected object" });
      expect(cached()).toContainEqual({ message: "Unrelated object" });
    });
    late.resolve({ message: "Canceled stale object" });
    await canceled;
    view.render(options);
    window.dispatchEvent(new Event("visibilitychange"));
    await expect
      .element(page.getByText("Canceled stale object"))
      .not.toBeInTheDocument();
    expect(cached()).not.toContainEqual({ message: "Canceled stale object" });
    expect(read).toHaveBeenCalledTimes(4);

    const retry = view.refetch();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(5));
    admitted.resolve({ message: "Readmitted object" });
    await retry;
    await expect.element(page.getByText("Readmitted object")).toBeVisible();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    await expect.element(draft).toHaveValue("unfinished edit");
    await expect(view.refetch()).rejects.toBe(forbidden);
    await expect
      .element(page.getByText("Readmitted object"))
      .not.toBeInTheDocument();
    view.leave();
    view.render(options);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(7));
    await expect
      .element(page.getByText("Readmitted object"))
      .not.toBeInTheDocument();
    returned.resolve({ message: "Returned admitted object" });
    await expect
      .element(page.getByText("Returned admitted object"))
      .toBeVisible();
    expect(otherRead).toHaveBeenCalledOnce();
    expect(cached()).toContainEqual({ message: "Unrelated object" });
    expect(view.client.authenticationScope).toBe("a".repeat(64));
  } finally {
    view.dispose();
  }
});

// A cleared cache must not be recreated by a transport that ignores AbortSignal,
// including a same-named account in another realm and a new permission epoch.
test("admission changes and permission clears isolate late reads and retire retained clients", async () => {
  const late = deferred<{ message: string }>();
  const view = mounted();
  const retired = view.binding();
  const read = vi
    .fn<Options["read"]>()
    .mockResolvedValueOnce({ message: "Private A" })
    .mockReturnValue(late.promise);
  const options: Options = {
    key: "keys.list",
    params: { cursor: "all" },
    read,
    policy: { focus: "always", staleTimeMs: Number.POSITIVE_INFINITY },
  };
  try {
    view.render(options);
    await expect.element(page.getByText("Private A")).toBeVisible();
    window.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    view.leave();
    view.client.clear();
    view.client.admitReadScope("b".repeat(64));
    const next = deferred<{ message: string }>();
    view.render({ ...options, read: () => next.promise });
    await expect
      .element(page.getByRole("status", { name: "Read state" }))
      .toHaveTextContent("Loading");
    next.resolve({ message: "Private B" });
    await expect.element(page.getByText("Private B")).toBeVisible();
    late.resolve({ message: "Late A" });
    await late.promise;
    await expect(
      retired.invalidate({ key: "keys.list" })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(
      view.client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data)
    ).toEqual([{ message: "Private B" }]);
    const previous = createWorkspaceReads(view.client, {
      scopeKey: "retained-permission-client",
      signal: new AbortController().signal,
      policy: {},
    });
    view.leave();
    view.client.clear();
    view.render({
      ...options,
      read: async () => ({ message: "New permission epoch" }),
    });
    await expect.element(page.getByText("New permission epoch")).toBeVisible();
    await expect(
      previous.invalidate({ key: "keys.list" })
    ).rejects.toMatchObject({ name: "AbortError" });
    view.leave();
    view.binding("beta");
    view.render({
      ...options,
      read: async () => ({ message: "Separate Beta" }),
    });
    await expect.element(page.getByText("Separate Beta")).toBeVisible();
    expect(view.client.getQueryCache().getAll()).toHaveLength(2);
  } finally {
    view.dispose();
  }
});

test("only a successful write ACK invalidates its scoped read and credentials never enter cache data", async () => {
  const firstWrite = deferred<string>();
  const secondWrite = deferred<string>();
  const write = vi
    .fn<() => Promise<string>>()
    .mockReturnValueOnce(firstWrite.promise)
    .mockReturnValue(secondWrite.promise);
  const read = vi.fn(async () => ({ message: "Masked key metadata" }));
  const options: Options = {
    key: "keys.list",
    params: { cursor: "all" },
    read,
  };
  const view = mounted();
  try {
    const betaRead = vi.fn(async () => ({ message: "Beta key metadata" }));
    view.binding("beta");
    view.render({ ...options, read: betaRead });
    await expect.element(page.getByText("Beta key metadata")).toBeVisible();
    view.leave();
    const otherRead = vi.fn(async () => ({
      message: "Unrelated request metadata",
    }));
    view.render({ ...options, key: "requests.list", read: otherRead });
    await expect
      .element(page.getByText("Unrelated request metadata"))
      .toBeVisible();
    view.render(options, write);
    await expect.element(page.getByText("Masked key metadata")).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    expect(read).toHaveBeenCalledOnce();
    firstWrite.reject(new Error("Write denied"));
    await expect
      .element(page.getByRole("status", { name: "Write state" }))
      .toHaveTextContent("refused");
    expect(read).toHaveBeenCalledOnce();
    await page.getByRole("button", { name: "Save" }).click();
    expect(read).toHaveBeenCalledOnce();
    secondWrite.resolve("synthetic-one-time-key");
    await expect
      .element(page.getByRole("status", { name: "Write state" }))
      .toHaveTextContent("saved");
    expect(read).toHaveBeenCalledTimes(2);
    expect(betaRead).toHaveBeenCalledOnce();
    expect(otherRead).toHaveBeenCalledOnce();
    await expect
      .element(page.getByRole("status", { name: "One-time key" }))
      .toHaveTextContent("synthetic-one-time-key");
    expect(
      view.client
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.data !== undefined)
        .map((query) => query.state.data)
    ).toEqual(
      expect.arrayContaining([
        { message: "Masked key metadata" },
        { message: "Beta key metadata" },
        { message: "Unrelated request metadata" },
      ])
    );
  } finally {
    view.dispose();
  }
});
