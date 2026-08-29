import { describe, expect, it, vi } from "vitest";

import {
  demoPluginInventory,
  type PluginInventory,
} from "./plugin-workbench-model";
import {
  pluginConfigurationHistoryQueryKey,
  pluginConfigurationHistoryMutationPrefix,
  pluginHistoryRecoveryInterval,
  pluginHistoryQueryEnabled,
  pluginManagementQueryKey,
  pluginManagementRefreshInterval,
  PluginMutationInProgressError,
  pluginMutationBelongsToStream,
  pluginMutationIsPending,
  readNextPluginInventory,
  reservePluginMutation,
  pluginWorkbenchQueryKey,
} from "./use-plugin-workbench";

function rejectedEvent(cursor: string) {
  return { cursor, detail: `failure-${cursor}`, status: "rejected" as const };
}

describe("Plugin workbench query boundaries", () => {
  it.each([
    { completeCursor: "10", partialCursor: "10" },
    { completeCursor: "2", partialCursor: "2" },
  ])(
    "refetches an unpaged snapshot when a new stream starts at cursor $partialCursor",
    async ({ completeCursor, partialCursor }) => {
      const previous: PluginInventory = {
        ...demoPluginInventory,
        cursor: "5",
        events: [rejectedEvent("5")],
        streamId: "host-stream-1",
      };
      const partial: PluginInventory = {
        ...demoPluginInventory,
        cursor: partialCursor,
        events: [rejectedEvent(partialCursor)],
        streamId: "host-stream-2",
      };
      const complete: PluginInventory = {
        ...partial,
        cursor: completeCursor,
        events: Array.from({ length: Number(completeCursor) }, (_, index) =>
          rejectedEvent(String(index + 1))
        ),
      };
      const read = vi
        .fn()
        .mockResolvedValueOnce(partial)
        .mockResolvedValueOnce(complete);

      await expect(
        readNextPluginInventory(previous, new AbortController().signal, read)
      ).resolves.toEqual(complete);
      expect(read.mock.calls.map(([after]) => after)).toEqual(["5", undefined]);
    }
  );

  it("partitions management and history caches by Host stream", () => {
    expect(pluginManagementQueryKey("stream-1")).not.toEqual(
      pluginManagementQueryKey("stream-2")
    );
    expect(
      pluginConfigurationHistoryQueryKey({
        instanceKey: "default",
        packageId: "example.echo",
        revision: "root",
        sourceDigest: "source-1",
        streamId: "stream-1",
      })
    ).not.toEqual(
      pluginConfigurationHistoryQueryKey({
        instanceKey: "default",
        packageId: "example.echo",
        revision: "root",
        sourceDigest: "source-1",
        streamId: "stream-2",
      })
    );
  });

  it("retries failed publication history without polling healthy data", () => {
    expect(pluginHistoryRecoveryInterval(new Error("offline"), true)).toBe(
      5000
    );
    expect(pluginHistoryRecoveryInterval(null, true)).toBe(false);
    expect(pluginHistoryRecoveryInterval(new Error("offline"), false)).toBe(
      false
    );
  });

  it("does not load publication TOML until the history disclosure is open", () => {
    expect(pluginHistoryQueryEnabled(true, false, true)).toBe(false);
    expect(pluginHistoryQueryEnabled(true, true, true)).toBe(true);
    expect(pluginHistoryQueryEnabled(false, true, true)).toBe(false);
    expect(pluginHistoryQueryEnabled(true, true, false)).toBe(false);
  });

  it("checks exact management source freshness at a bounded idle interval", () => {
    expect(
      pluginManagementRefreshInterval({
        apiMode: true,
        hasError: false,
        needsRevisionRefresh: false,
      })
    ).toBe(15_000);
    expect(
      pluginManagementRefreshInterval({
        apiMode: true,
        hasError: false,
        needsRevisionRefresh: true,
      })
    ).toBe(750);
  });

  it("hides pending and failed mutations from an earlier Host stream", () => {
    expect(pluginMutationBelongsToStream("stream-a", "stream-a")).toBe(true);
    expect(pluginMutationBelongsToStream("stream-a", "stream-b")).toBe(false);
    expect(pluginMutationBelongsToStream(null, "stream-b")).toBe(false);
  });

  it("reserves a write synchronously and rejects a second click", () => {
    const mutation = {
      enabled: false,
      expectedStreamId: "stream-a",
      instanceKey: "default",
      packageId: "example.echo",
      type: "select" as const,
    };
    const first = reservePluginMutation(null, mutation, "stream-a");
    expect(first.error).toBeNull();
    expect(
      pluginMutationIsPending(
        false,
        first.reservation?.streamId ?? null,
        "stream-a"
      )
    ).toBe(true);
    expect(
      reservePluginMutation(first.reservation, mutation, "stream-a").error
    ).toBeInstanceOf(PluginMutationInProgressError);
    expect(
      reservePluginMutation(null, mutation, "stream-a", true).error
    ).toBeInstanceOf(PluginMutationInProgressError);
  });

  it("refreshes publication history only after a configuration publication", () => {
    expect(
      pluginConfigurationHistoryMutationPrefix({
        enabled: false,
        expectedStreamId: "stream-a",
        instanceKey: "default",
        packageId: "example.echo",
        type: "select",
      })
    ).toBeNull();
    expect(
      pluginConfigurationHistoryMutationPrefix({
        expectedRevision: "root-a",
        expectedSourceDigest: "source-a",
        expectedStreamId: "stream-a",
        instanceKey: "default",
        packageId: "example.echo",
        proposalDigest: "proposal-a",
        toml: "enabled = false\n",
        type: "configure",
      })
    ).toEqual([
      ...pluginWorkbenchQueryKey,
      "configuration-history",
      "stream-a",
      "example.echo",
      "default",
    ]);
  });

  it("rejects a captured write after the Host stream changes", () => {
    expect(
      reservePluginMutation(
        null,
        {
          expectedStreamId: "stream-a",
          packageId: "example.echo",
          type: "remove",
        },
        "stream-b"
      ).error
    ).toMatchObject({ name: "AbortError" });
  });
});
