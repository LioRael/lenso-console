import { describe, expect, it } from "vitest";

import { createTaskSnapshotPoller } from "./task-snapshot-poller";

describe("task snapshot polling", () => {
  it("does not deliver a delayed snapshot after the active conversation changes", async () => {
    let resolvePrevious: ((value: readonly string[]) => void) | undefined;
    let resolveCurrent: ((value: readonly string[]) => void) | undefined;
    const delivered: string[][] = [];
    let scheduledPreviousPoll: (() => void) | undefined;
    const previous = createTaskSnapshotPoller({
      deliver: (snapshot) => delivered.push([...snapshot]),
      read: () =>
        new Promise<readonly string[]>((resolve) => {
          resolvePrevious = resolve;
        }),
      schedule: (poll) => {
        scheduledPreviousPoll = poll;
        return () => undefined;
      },
    });

    previous.start();
    expect(scheduledPreviousPoll).toBeUndefined();
    previous.cancel();

    const current = createTaskSnapshotPoller({
      deliver: (snapshot) => delivered.push([...snapshot]),
      read: () =>
        new Promise<readonly string[]>((resolve) => {
          resolveCurrent = resolve;
        }),
      schedule: () => () => undefined,
    });
    current.start();

    if (!(resolveCurrent && resolvePrevious)) {
      throw new Error("Expected both task snapshot reads to start");
    }
    resolveCurrent(["current"]);
    await Promise.resolve();
    resolvePrevious(["previous"]);
    await Promise.resolve();

    expect(delivered).toEqual([["current"]]);
  });
});
