import { afterEach, describe, expect, it, vi } from "vitest";

import contractFixture from "./__fixtures__/plugin-control-contract.json";
import {
  decodePluginConfigurationPublication,
  executePluginMutation,
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
};

describe("Plugin operation lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("decodes the Host-owned golden contract without numeric cursor loss", () => {
    // Vendored from lenso-agent-harness/apps/lenso-agent-web/tests/fixtures/
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
      })
    ).toThrow("invalid Plugin operation response");
  });

  it.each([
    { id: "different-operation" },
    { cursor: "11" },
    { planDigest: "different-plan" },
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
