import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { afterEach, describe, expect, it, vi } from "vitest";

import { consoleContract } from "../../../../../../packages/console-authoring/src/protocol";
import type * as ConsolePaths from "../../lib/console-http-paths";
import { contributionAssetUrl } from "./contribution-asset-url";
import type { PageMount } from "./page-contribution-catalog";
import { createWorkspaceServices } from "./workspace-service-client";

vi.mock("../../lib/console-http-paths", async (importOriginal) => ({
  ...(await importOriginal<typeof ConsolePaths>()),
  consoleHttpPaths: {
    shell_base_path: "/ops",
    api_base_path: "/ops/api",
    auth_base_path: "/ops/auth",
    workspace_sources: [{ api_base_path: "/api/external" }],
  },
}));

const mount: PageMount = {
  apiMajor: 1,
  id: "observe",
  module: `/ops/api/console/v1/pages/observe/assets/${"a".repeat(64)}/page.mjs`,
  styles: [],
  navigation: { items: [], label: "Observe" },
  owner: {
    instance: "observe/default",
    source: "resolved-plan",
    trusted: true,
  },
  requirements: [
    {
      available: true,
      capability_id: "observe",
      descriptor_version: "1",
      operations: ["read"],
      required: true,
      service_id: "observe",
      source: "owner",
    },
  ],
  revision: "1",
  subject: { kind: "console" },
  title: "Observe",
};

afterEach(() => vi.unstubAllGlobals());

describe("deployed workspace paths", () => {
  it.each(["/ops/api", "/api/external"])(
    "preserves normal and recovery module/style URLs under %s",
    (prefix) => {
      vi.stubGlobal("window", {
        location: { origin: "https://console.test" },
      });
      for (const name of ["page.mjs", "page.css"]) {
        const href = `${prefix}/console/v1/pages/observe/assets/${"a".repeat(64)}/${name}`;
        expect(contributionAssetUrl(href, false)).toBe(href);
        const recovery = new URL(
          contributionAssetUrl(href, true),
          window.location.origin
        );
        expect(recovery.origin).toBe(window.location.origin);
        expect(recovery.pathname).toBe(href);
        expect(recovery.searchParams.has("__lenso_console_recovery")).toBe(
          true
        );
      }
    }
  );

  it("uses the bootstrap prefix for ordinary RPC dispatch", async () => {
    const handler = new RPCHandler({
      workspace: {
        invoke: implement(consoleContract.workspace.invoke).handler(
          ({ input }) => input.input
        ),
      },
    });
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(
          new URL(String(input), "https://console.test"),
          init
        );
        const result = await handler.handle(request, {
          prefix: "/ops/api/console/v2/rpc",
          context: {},
        });
        return result.matched
          ? result.response
          : new Response(null, { status: 404 });
      }
    );
    vi.stubGlobal("fetch", fetch);
    const services = createWorkspaceServices({
      ...mount,
      protocol: "lenso-console-rpc/2",
    });
    await expect(
      services.invoke("observe", "read", { project: "one" })
    ).resolves.toEqual({ project: "one" });
    expect(String(fetch.mock.calls[0]![0])).toBe(
      "/ops/api/console/v2/rpc/workspace/invoke"
    );
  });

  it("uses the bootstrap prefix for ordinary legacy dispatch", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      createWorkspaceServices(mount).invoke("observe", "read", {})
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "/ops/api/console/v1/pages/observe/services/observe/invoke/read",
      expect.objectContaining({ method: "POST" })
    );
  });
});
