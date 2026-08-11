import {
  CONSOLE_SURFACE_GATEWAY_PROTOCOL,
  type ConsoleSha256Digest,
  type ManagedServiceContext,
  type SurfaceOperationRequest,
} from "@lenso/console-module-api";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createConsoleModuleClient } from "./console-module-client";

const digest =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as ConsoleSha256Digest;
const operationId = "support-ticket/http/GET:/tickets";
const managedServiceContext: ManagedServiceContext = {
  callerModuleId: "support/tickets",
  capabilities: ["console.module.business.read"],
  delegatedActorSubject: "usr_operator",
  delegatedAuthorityDigest: digest,
  environmentId: "acceptance",
  serviceId: "support-ticket",
  systemId: "support-desk",
  targetServicePrincipal: "svc.support-ticket",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Console Module client Surface Gateway wire contract", () => {
  test("accepts a response that omits absent optional request context fields", async () => {
    const deadlineUnixMs = Date.now() + 60_000;
    stubSurfaceGatewayResponse({ deadlineUnixMs });

    const response = await invokeSurface(deadlineUnixMs);

    expect(response.requestContext).toEqual({ deadlineUnixMs });
    expect(response.requestContext).not.toHaveProperty("tenantId");
    expect(response.requestContext).not.toHaveProperty("idempotencyKey");
    expect(response.requestContext).not.toHaveProperty("story");
  });

  test("rejects null drift for optional request context fields", async () => {
    const deadlineUnixMs = Date.now() + 60_000;
    stubSurfaceGatewayResponse({
      deadlineUnixMs,
      idempotencyKey: null,
      story: null,
      tenantId: null,
    });

    await expect(invokeSurface(deadlineUnixMs)).rejects.toThrow(
      "Surface Gateway returned a response for a different contract operation"
    );
  });

  test("rejects blank optional Story identifiers before sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const deadlineUnixMs = Date.now() + 60_000;

    for (const [story, message] of [
      [
        {
          correlationId: " \t ",
          storyId: "support-desk.acceptance",
        },
        "Surface operation Story correlation id must be non-empty",
      ],
      [
        {
          segmentId: " \t ",
          storyId: "support-desk.acceptance",
        },
        "Surface operation Story segment id must be non-empty",
      ],
    ] as const) {
      await expect(invokeSurface(deadlineUnixMs, story)).rejects.toThrow(
        message
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

function invokeSurface(
  deadlineUnixMs: number,
  story?: SurfaceOperationRequest<unknown>["requestContext"]["story"]
) {
  const client = createConsoleModuleClient({
    capabilities: managedServiceContext.capabilities,
    managedServiceContext,
    moduleId: "support/tickets",
    moduleReleaseDigest: digest,
    navigate: vi.fn(),
    requiredCapabilities: ["console.module.business.read"],
    uiArtifactDigest: digest,
  });
  const request = {
    context: managedServiceContext,
    contractDigest: digest,
    input: {},
    moduleId: "support/tickets",
    moduleReleaseDigest: digest,
    operationId,
    protocol: CONSOLE_SURFACE_GATEWAY_PROTOCOL,
    requestContext: {
      deadlineUnixMs,
      ...(story ? { story } : {}),
    },
    uiArtifactDigest: digest,
  } satisfies SurfaceOperationRequest<Record<string, never>>;

  return client.surfaceApi.invoke(request);
}

function stubSurfaceGatewayResponse(requestContext: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        Response.json(
          {
            contractDigest: digest,
            moduleId: "support/tickets",
            operationId,
            output: { tickets: [] },
            protocol: CONSOLE_SURFACE_GATEWAY_PROTOCOL,
            requestContext,
          },
          {
            status: 200,
          }
        )
      )
    )
  );
}
