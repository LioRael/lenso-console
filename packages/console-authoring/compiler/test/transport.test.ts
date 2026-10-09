import { describe, expect, it } from "bun:test";

import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { consoleContract } from "../../src/protocol";
import {
  createConsoleClient,
  createConsoleWorkspaceServices,
  WorkspaceServiceDomainError,
  WorkspaceServiceError,
} from "../../src/transport";

const mount = {
  id: "notes",
  owner: { instance: "notes/primary" },
  revision: "revision-1",
  implementationId: "a".repeat(64),
  requirements: [
    {
      available: true,
      service_id: "notes",
      operations: ["echo", "safeError", "domainError"],
    },
  ],
};

describe("Console SDK Fetch transport", () => {
  // Mocked JSON cannot prove compatibility with the actual RPC framing.
  it("round trips Unicode JSON without base64 and preserves explicit public errors", async () => {
    const implementation = implement(consoleContract).$context<{
      headers: Headers;
    }>();
    const headers: Headers[] = [];
    const handler = new RPCHandler(
      implementation.router({
        catalog: implementation.catalog.handler(() => ({
          schemaVersion: 1,
          revision: "fixture",
          operations: [],
        })),
        invoke: implementation.invoke.handler(({ input }) => input.input),
        plugins: implementation.plugins.handler(() => ({
          schemaVersion: 1,
          plugins: [],
        })),
        targets: implementation.targets.handler(() => ({
          schemaVersion: 1,
          targets: [{ id: "世界", label: "世界 🌍" }],
        })),
        workspace: {
          invoke: implementation.workspace.invoke.handler(
            ({ input, context }) => {
              headers.push(context.headers);
              if (input.operation === "safeError") {
                throw new ORPCError("WORKSPACE_SERVICE_ERROR", {
                  message: "Public conflict",
                  data: { code: "notes_conflict", status: 409 },
                });
              }
              if (input.operation === "domainError") {
                throw new ORPCError("WORKSPACE_SERVICE_DOMAIN_ERROR", {
                  data: { payload: { error: "denied", reason: "权限不足" } },
                });
              }
              return input.input;
            }
          ),
        },
      }),
      {
        errorStatusMap: {
          WORKSPACE_SERVICE_ERROR: 409,
          WORKSPACE_SERVICE_DOMAIN_ERROR: 422,
        },
      }
    );
    const bodies: string[] = [];
    const fetch = async (url: string, init: RequestInit) => {
      const request = new Request(url, init);
      bodies.push(await request.clone().text());
      const result = await handler.handle(request, {
        prefix: "/api/console/v2/rpc",
        context: { headers: request.headers },
      });
      return result.matched
        ? result.response
        : new Response(null, { status: 404 });
    };
    const options = { origin: "https://console.test", fetch };
    await expect(createConsoleClient(options).targets()).resolves.toEqual({
      schemaVersion: 1,
      targets: [{ id: "世界", label: "世界 🌍" }],
    });
    const services = createConsoleWorkspaceServices({
      ...options,
      mount,
      expectedSubject: "actor-a",
      headers: () => ({
        "x-custom": "custom",
        "x-lenso-page-owner": "cannot-override",
      }),
    });
    const input = { text: "你好 🌍", nested: { value: ["é", "日本語"] } };
    await expect(services.invoke("notes", "echo", input)).resolves.toEqual(
      input
    );
    expect(bodies[1]).toContain("你好 🌍");
    expect(bodies[1]).not.toContain("bodyBase64");
    expect(headers[0]?.get("x-lenso-page-owner")).toBe(mount.owner.instance);
    expect(headers[0]?.get("x-lenso-page-revision")).toBe(mount.revision);
    expect(headers[0]?.get("x-lenso-page-implementation")).toBe(
      mount.implementationId
    );
    expect(headers[0]?.get("x-lenso-expected-subject")).toBe("actor-a");
    expect(headers[0]?.get("x-custom")).toBe("custom");
    const safeError = await services
      .invoke("notes", "safeError", {})
      .catch((error) => error);
    expect(safeError).toBeInstanceOf(WorkspaceServiceError);
    expect(safeError).toMatchObject({ code: "notes_conflict", status: 409 });
    const domainError = await services
      .invoke("notes", "domainError", {})
      .catch((error) => error);
    expect(domainError).toBeInstanceOf(WorkspaceServiceDomainError);
    expect(domainError).toMatchObject({
      status: 422,
      payload: { error: "denied", reason: "权限不足" },
    });
    expect(bodies).toHaveLength(4);
  });
});
