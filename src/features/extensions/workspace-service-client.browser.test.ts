import { afterEach, expect, test, vi } from "vitest";

import type { PageMount } from "./page-contribution-catalog";
import { createWorkspaceServices } from "./workspace-service-client";

const mount: PageMount = {
  apiMajor: 1,
  id: "cancel",
  module:
    "/api/console/v1/pages/cancel/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workspace.mjs",
  navigation: { items: [], label: "Cancel" },
  owner: { instance: "cancel/default", source: "resolved-plan", trusted: true },
  requirements: [
    {
      available: true,
      capability_id: "example.cancel@1",
      descriptor_version: "1.0.0",
      operations: ["wait"],
      required: true,
      service_id: "cancel",
      source: "owner",
    },
  ],
  revision: "1",
  styles: [],
  subject: { kind: "console" },
  title: "Cancel",
};

afterEach(() => vi.unstubAllGlobals());

test("aborts a Workspace service request when its mount signal is cancelled", async () => {
  let observedSignal: AbortSignal | null | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      });
    })
  );
  const controller = new AbortController();
  const request = createWorkspaceServices(mount).invoke(
    "cancel",
    "wait",
    {},
    { signal: controller.signal }
  );

  controller.abort();

  await expect(request).rejects.toMatchObject({ name: "AbortError" });
  expect(observedSignal).toBe(controller.signal);
  expect(observedSignal?.aborted).toBe(true);
});
