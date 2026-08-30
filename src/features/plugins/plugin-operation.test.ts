import ky from "ky";
import { afterEach, describe, expect, it, vi } from "vitest";

import { httpClient } from "../../lib/http-client";
import contractFixture from "./__fixtures__/plugin-control-contract.json";
import {
  decodePluginConfigurationPublication,
  executePluginMutation,
  readPluginManagementConditional,
  readPluginConfigurationProposal,
  readPluginConfigurationRollbackProposal,
  submitPluginMutation,
  type PluginMutation,
} from "./plugin-control-client";
import {
  decodePluginConfigurationProposal,
  decodePluginInventory,
  decodePluginManagement,
} from "./plugin-control-contract";
import {
  decodePluginMutationReceipt,
  decodePluginOperationResponse,
  PluginOperationFailedError,
  PluginOperationTimeoutError,
  waitForPluginOperation,
  type PluginMutationReceipt,
  type PluginOperation,
} from "./plugin-operation";

const acceptedOperation: PluginOperation = {
  acceptedAfterCursor: "12",
  cursor: "12",
  desiredStateDigest: "desired-state",
  id: "operation-1",
  planDigest: "desired-plan",
  pluginRootRevision: "desired-root",
  status: "accepted",
  streamId: "stream-1",
};

const receipt: PluginMutationReceipt = {
  desired: {
    desiredStateDigest: "desired-state",
    planDigest: "desired-plan",
    pluginRootRevision: "desired-root",
    plugins: [],
  },
  operation: acceptedOperation,
  schema: "lenso.agent.plugin-operation.v1",
  streamId: "stream-1",
};

describe("Plugin operation lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("decodes the Host-owned golden contract without numeric cursor loss", () => {
    // Vendored from lenso-agent/apps/lenso-agent-web/tests/fixtures/
    // plugin-control-contract.json; the Host asserts its actual serializers
    // against the same fixture.
    expect(decodePluginInventory(contractFixture.inventory).cursor).toBe(
      "9007199254740993"
    );
    expect(decodePluginInventory(contractFixture.inventory)).toMatchObject({
      appliedRevision: "sha256:root-active",
      configurationStatus: "pending",
      desiredRevision: "sha256:root-next",
    });
    expect(decodePluginMutationReceipt(contractFixture.mutation)).toMatchObject(
      {
        desired: null,
        operation: { status: "rejected" },
      }
    );
    expect(
      decodePluginOperationResponse(contractFixture.operation)
    ).toMatchObject({
      operation: {
        cursor: "9007199254740992",
        pluginRootRevision: "sha256:root-next",
        status: "preparing",
      },
    });
    expect(decodePluginManagement(contractFixture.management)).toMatchObject({
      revision: "sha256:root-next",
      schema: "lenso.agent.plugin-management.v1",
    });
    expect(
      decodePluginConfigurationProposal(contractFixture.proposal)
    ).toMatchObject({
      candidateRevision: "sha256:root-next",
      status: "ready",
    });
    expect(
      decodePluginConfigurationPublication(contractFixture.publicationApplied)
    ).toMatchObject({
      desired: { configurationStatus: "applied" },
      operation: { status: "switched" },
      publicationStatus: "published",
    });
    expect(
      decodePluginConfigurationPublication(contractFixture.publicationPending)
    ).toMatchObject({
      desired: { configurationStatus: "pending" },
      operation: { status: "accepted" },
      publicationStatus: "published",
    });
  });

  it("requires a verifiable receipt from every accepted mutation", () => {
    expect(() =>
      decodePluginMutationReceipt({
        desired: { plugins: [] },
        schema: "lenso.agent.plugin-mutation.v1",
        status: "accepted",
      })
    ).toThrow("without a verifiable Plugin operation receipt");
  });

  it("uses the Host ETag to avoid downloading unchanged management TOML", async () => {
    const request = vi
      .spyOn(httpClient, "get")
      .mockImplementationOnce((_input, options) =>
        ky("https://console.invalid/plugin-management", {
          ...options,
          fetch: async () =>
            new Response(null, {
              headers: { etag: '"sha256:management"' },
              status: 304,
            }),
        })
      );

    await expect(
      readPluginManagementConditional(
        '"sha256:management"',
        new AbortController().signal
      )
    ).resolves.toEqual({
      etag: '"sha256:management"',
      management: null,
    });
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: { "If-None-Match": '"sha256:management"' },
    });
  });

  it("sends the Host-owned exact-source proposal and rollback fences", async () => {
    const request = vi.spyOn(httpClient, "post");
    request.mockImplementationOnce(() =>
      ky("https://console.invalid/plugin-proposal", {
        fetch: async () => Response.json(contractFixture.proposal),
        method: "post",
      })
    );

    await readPluginConfigurationProposal({
      ...contractFixture.proposalRequest,
      instanceKey: "default",
      packageId: "example.echo",
    });
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      json: contractFixture.proposalRequest,
    });

    const rollbackResponse = {
      configurationToml: "enabled = true\n",
      proposal: {
        ...contractFixture.proposal,
        baseRevision: contractFixture.rollbackProposalRequest.expectedRevision,
        baseSourceDigest:
          contractFixture.rollbackProposalRequest.expectedSourceDigest,
        candidateRevision: "sha256:root-active",
        proposalDigest: "sha256:rollback-proposal",
      },
      rollbackOfProposalDigest:
        contractFixture.rollbackProposalRequest.publicationProposalDigest,
      schema: "lenso.agent.plugin-configuration-rollback-proposal.v1",
    };
    request.mockImplementationOnce(() =>
      ky("https://console.invalid/plugin-rollback-proposal", {
        fetch: async () => Response.json(rollbackResponse),
        method: "post",
      })
    );

    await readPluginConfigurationRollbackProposal({
      ...contractFixture.rollbackProposalRequest,
      instanceKey: "default",
      packageId: "example.echo",
    });
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      json: contractFixture.rollbackProposalRequest,
    });
  });

  it("rejects an operation envelope without a Host stream identity", () => {
    expect(() =>
      decodePluginOperationResponse({
        operation: {
          acceptedAfterCursor: "9",
          cursor: "9",
          desiredStateDigest: "desired-state",
          id: "operation-1",
          planDigest: "desired-plan",
          pluginRootRevision: "desired-root",
          status: "accepted",
        },
        schema: "lenso.agent.plugin-operation.v1",
      })
    ).toThrow("invalid Plugin operation response");
  });

  it("rejects failure receipts with partial Desired identity", () => {
    expect(() =>
      decodePluginMutationReceipt({
        desired: null,
        operation: {
          acceptedAfterCursor: "9",
          cursor: "9",
          detail: "candidate rejected",
          id: "operation-1",
          pluginRootRevision: "desired-root",
          status: "rejected",
        },
        schema: "lenso.agent.plugin-operation.v1",
        streamId: "stream-1",
      })
    ).toThrow("invalid Plugin operation receipt");
  });

  it("decodes a rejected operation receipt carried by a real Ky HTTPError", async () => {
    vi.spyOn(httpClient, "put").mockImplementationOnce(() =>
      ky("https://console.invalid/plugin-mutation", {
        fetch: async () =>
          Response.json(contractFixture.mutation, { status: 409 }),
        retry: 0,
      })
    );

    await expect(
      submitPluginMutation(
        {
          enabled: false,
          expectedStreamId: contractFixture.inventory.streamId,
          instanceKey: "default",
          packageId: "example.echo",
          type: "select",
        },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      desired: null,
      operation: { status: "rejected" },
    });
  });

  it("does not reinterpret a server error as a Plugin operation receipt", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(contractFixture.mutation, { status: 500 })
      )
      .mockResolvedValueOnce(
        Response.json(contractFixture.mutation, { status: 200 })
      );
    const request = vi
      .spyOn(httpClient, "put")
      .mockImplementationOnce((_input, options) =>
        ky("https://console.invalid/plugin-mutation", {
          ...options,
          fetch,
          method: "put",
        })
      );

    const result = submitPluginMutation(
      {
        enabled: false,
        expectedStreamId: contractFixture.inventory.streamId,
        instanceKey: "default",
        packageId: "example.echo",
        type: "select",
      },
      new AbortController().signal
    );

    await expect(result).rejects.toMatchObject({ response: { status: 500 } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      json: { expectedStreamId: contractFixture.inventory.streamId },
      retry: 0,
    });
  });

  it.each([
    [
      "install",
      "post",
      {
        bundlePath: "/tmp/example.lenso-plugin",
        expectedStreamId: contractFixture.inventory.streamId,
        type: "install",
      },
    ],
    [
      "remove",
      "delete",
      {
        expectedStreamId: contractFixture.inventory.streamId,
        packageId: "example.echo",
        type: "remove",
      },
    ],
    [
      "configure",
      "put",
      {
        expectedRevision: "sha256:root-active",
        expectedSourceDigest:
          contractFixture.publicationRequest.expectedSourceDigest,
        expectedStreamId: contractFixture.inventory.streamId,
        instanceKey: "default",
        packageId: "example.echo",
        proposalDigest: "sha256:proposal-next",
        toml: "enabled = false\n",
        type: "configure",
      },
    ],
    [
      "select",
      "put",
      {
        enabled: false,
        expectedStreamId: contractFixture.inventory.streamId,
        instanceKey: "default",
        packageId: "example.echo",
        type: "select",
      },
    ],
    [
      "reset",
      "delete",
      {
        expectedStreamId: contractFixture.inventory.streamId,
        instanceKey: "default",
        packageId: "example.echo",
        type: "reset",
      },
    ],
  ] satisfies readonly (readonly [
    string,
    "delete" | "post" | "put",
    PluginMutation,
  ])[])(
    "disables transport retries for %s writes",
    async (_name, method, mutation) => {
      const request = vi.spyOn(httpClient, method).mockImplementationOnce(() =>
        ky("https://console.invalid/plugin-mutation", {
          fetch: async () =>
            Response.json(contractFixture.mutation, { status: 409 }),
          method,
          retry: 0,
        })
      );

      await submitPluginMutation(mutation, new AbortController().signal);

      expect(request.mock.calls[0]?.[1]).toMatchObject({
        json: { expectedStreamId: contractFixture.inventory.streamId },
        retry: 0,
      });
    }
  );

  it("rejects a publication from a different reviewed proposal", async () => {
    vi.spyOn(httpClient, "put").mockImplementationOnce(() =>
      ky("https://console.invalid/plugin-publication", {
        fetch: async () =>
          Response.json(contractFixture.publicationApplied, { status: 200 }),
        retry: 0,
      })
    );

    await expect(
      submitPluginMutation(
        {
          expectedRevision: "sha256:other-base",
          expectedSourceDigest:
            contractFixture.publicationRequest.expectedSourceDigest,
          expectedStreamId: contractFixture.inventory.streamId,
          instanceKey: "default",
          packageId: "example.echo",
          proposalDigest: "sha256:other-proposal",
          toml: "enabled = false\n",
          type: "configure",
        },
        new AbortController().signal
      )
    ).rejects.toThrow("different reviewed proposal");
  });

  it("normalizes a successful configuration publication into a streamed receipt", async () => {
    const request = vi.spyOn(httpClient, "put").mockImplementationOnce(() =>
      ky("https://console.invalid/plugin-publication", {
        fetch: async () =>
          Response.json(contractFixture.publicationPending, { status: 200 }),
        retry: 0,
      })
    );

    await expect(
      submitPluginMutation(
        {
          expectedRevision: "sha256:root-active",
          expectedSourceDigest:
            contractFixture.publicationRequest.expectedSourceDigest,
          expectedStreamId: contractFixture.inventory.streamId,
          instanceKey: "default",
          packageId: "example.echo",
          proposalDigest: "sha256:proposal-next",
          toml: "enabled = false\n",
          type: "configure",
        },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      operation: {
        status: "accepted",
        streamId: contractFixture.publicationPending.streamId,
      },
      streamId: contractFixture.publicationPending.streamId,
    });
    expect(request.mock.calls[0]?.[1]?.json).toEqual(
      contractFixture.publicationRequest
    );
  });

  it("preserves rollback provenance when publishing a reviewed rollback", async () => {
    const request = vi.spyOn(httpClient, "put").mockImplementationOnce(() =>
      ky("https://console.invalid/plugin-rollback-publication", {
        fetch: async () =>
          Response.json(
            {
              ...contractFixture.publicationPending,
              baseRevision:
                contractFixture.rollbackPublicationRequest.expectedRevision,
              baseSourceDigest:
                contractFixture.rollbackPublicationRequest.expectedSourceDigest,
              proposalDigest:
                contractFixture.rollbackPublicationRequest.proposalDigest,
            },
            { status: 200 }
          ),
        retry: 0,
      })
    );

    await submitPluginMutation(
      {
        ...contractFixture.rollbackPublicationRequest,
        instanceKey: "default",
        packageId: "example.echo",
        type: "configure",
      },
      new AbortController().signal
    );

    expect(request.mock.calls[0]?.[1]?.json).toEqual(
      contractFixture.rollbackPublicationRequest
    );
    expect(request.mock.calls[0]?.[1]?.retry).toBe(0);
  });

  it("rejects switched operations without complete Generation evidence", () => {
    expect(() =>
      decodePluginOperationResponse({
        operation: {
          acceptedAfterCursor: "9",
          cursor: "9",
          desiredStateDigest: "desired-state",
          id: "operation-1",
          planDigest: "desired-plan",
          pluginRootRevision: "desired-root",
          status: "switched",
        },
        schema: "lenso.agent.plugin-operation.v1",
        streamId: "stream-1",
      })
    ).toThrow("invalid Plugin operation response");
  });

  it.each([
    { id: "different-operation" },
    { cursor: "11" },
    { planDigest: "different-plan" },
    { streamId: "different-stream" },
  ])("rejects a non-continuous polled receipt %#", async (change) => {
    await expect(
      waitForPluginOperation({
        initial: acceptedOperation,
        pollIntervalMs: 0,
        read: vi.fn().mockResolvedValue({
          ...acceptedOperation,
          ...change,
        }),
        signal: new AbortController().signal,
      })
    ).rejects.toThrow("inconsistent Plugin operation continuation");
  });

  it("polls accepted operations until the Host proves a switch", async () => {
    const onProgress = vi.fn();
    const read = vi
      .fn<
        (operationId: string, signal: AbortSignal) => Promise<PluginOperation>
      >()
      .mockResolvedValueOnce({
        ...acceptedOperation,
        generationSpecDigest: "candidate-generation",
        status: "preparing",
      })
      .mockResolvedValueOnce({
        ...acceptedOperation,
        cursor: "14",
        generationSpecDigest: "candidate-generation",
        status: "switched",
      });

    await expect(
      waitForPluginOperation({
        initial: acceptedOperation,
        onProgress,
        pollIntervalMs: 0,
        read,
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({ cursor: "14", status: "switched" });
    expect(
      onProgress.mock.calls.map(([operation]) => operation.status)
    ).toEqual(["accepted", "preparing", "switched"]);
  });

  it("surfaces Ready-Gate rejection as mutation failure", async () => {
    const rejected = {
      ...acceptedOperation,
      cursor: "13",
      detail: "candidate did not become ready",
      status: "rejected" as const,
    };

    await expect(
      executePluginMutation({
        mutation: {
          enabled: false,
          expectedStreamId: "stream-1",
          instanceKey: "agent",
          packageId: "lenso.agent.loop",
          type: "select",
        },
        pollIntervalMs: 0,
        readOperation: vi.fn().mockResolvedValue(rejected),
        requestMutation: vi.fn().mockResolvedValue(receipt),
        signal: new AbortController().signal,
      })
    ).rejects.toEqual(expect.any(PluginOperationFailedError));
  });

  it("times out without converting accepted into success", async () => {
    await expect(
      waitForPluginOperation({
        initial: acceptedOperation,
        read: vi.fn(),
        signal: new AbortController().signal,
        timeoutMs: 0,
      })
    ).rejects.toEqual(expect.any(PluginOperationTimeoutError));
  });

  it("caps idle polling with backoff instead of hammering the Host", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(acceptedOperation);
    const waiting = waitForPluginOperation({
      initial: acceptedOperation,
      read,
      signal: new AbortController().signal,
      timeoutMs: 3000,
    });
    const rejected = expect(waiting).rejects.toEqual(
      expect.any(PluginOperationTimeoutError)
    );

    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(read).toHaveBeenCalledTimes(5);
  });

  it("resets backoff when cursor or phase progress arrives", async () => {
    vi.useFakeTimers();
    const read = vi
      .fn()
      .mockResolvedValueOnce(acceptedOperation)
      .mockResolvedValueOnce({
        ...acceptedOperation,
        cursor: "13",
        status: "preparing",
      })
      .mockResolvedValueOnce({
        ...acceptedOperation,
        cursor: "14",
        status: "switched",
      });
    const waiting = waitForPluginOperation({
      initial: acceptedOperation,
      read,
      signal: new AbortController().signal,
    });

    await vi.advanceTimersByTimeAsync(150);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(150);
    await expect(waiting).resolves.toMatchObject({ status: "switched" });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("cancels polling when the caller leaves the workbench", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("view closed", "AbortError"));

    await expect(
      waitForPluginOperation({
        initial: acceptedOperation,
        read: vi.fn(),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
