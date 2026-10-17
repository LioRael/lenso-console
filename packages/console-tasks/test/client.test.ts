import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTaskQueue, defineTask } from "@lenso/tasks";
import { createD1TaskProvider, provisionD1TaskQueue } from "@lenso/tasks/d1";
import { z } from "zod";

import { sqliteD1 } from "../../console/test/fixtures/sqlite-d1";
import { createTaskClient } from "../src/client";

// Prevents a transport reporting success for a different job, and accidentally disclosing payloads.
test("adapter validates acknowledgements and strips private fields", async () => {
  const jobId = crypto.randomUUID();
  const job = {
    jobId,
    task: "local",
    state: "failed",
    attempt: 1,
    maxAttempts: 1,
    cancelRequested: false,
    failure: "handler-failed",
    input: "secret",
    result: "secret",
    resultText: "Approved report",
  };
  const client = createTaskClient({
    tasks: "jobs",
    retry: true,
    invoke: async (_, method) =>
      method === "get" ? job : { jobId: crypto.randomUUID(), retried: true },
  });
  expect(
    await client.get(jobId, new AbortController().signal)
  ).not.toHaveProperty("result");
  const projected = await client.get(jobId, new AbortController().signal);
  expect(projected.resultText).toBe("Approved report");
  await expect(
    client.retry!(jobId, new AbortController().signal)
  ).rejects.toThrow();
  await expect(
    client.get(crypto.randomUUID(), new AbortController().signal)
  ).rejects.toThrow();
  expect(
    createTaskClient({ tasks: "jobs", invoke: async () => null }).retry
  ).toBeUndefined();
});

// Existing server tests prove authorization. This proves the UI adapter's outcomes survive a real local provider restart.
test("client observes failed, retried and cancelled jobs after SQLite reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "console-tasks-"));
  let db = new Database(join(directory, "tasks.sqlite"));
  let queue: ReturnType<typeof createTaskQueue> | undefined;
  try {
    db.exec(
      await Bun.file(
        new URL(
          "../migrations/d1/0001_tasks.sql",
          import.meta.resolve("@lenso/tasks/d1")
        )
      ).text()
    );
    await provisionD1TaskQueue(sqliteD1(db), "local-only");
    const task = defineTask({
      name: "local.failure",
      input: z.object({}),
      maxAttempts: 1,
      async handler(): Promise<void> {
        throw new Error("fixture failure");
      },
    });
    const report = defineTask({
      name: "local.report",
      input: z.object({}),
      handler: async () => ({ text: "Durable report" }),
      result: (value) => value,
    });
    const open = async () =>
      createTaskQueue({
        provider: await createD1TaskProvider({
          database: sqliteD1(db),
          queueName: "local-only",
        }),
        tasks: [task, report],
      });
    queue = await open();
    const id = await queue.enqueue(task, {});
    await queue.runBatch({ maxJobs: 1 });
    db.close();
    db = new Database(join(directory, "tasks.sqlite"));
    queue = await open();
    const client = createTaskClient({
      tasks: "local",
      retry: true,
      cancel: true,
      invoke: async (_, method, input) => {
        const { jobId } = input as { jobId: string };
        if (method === "get") {
          const job = await queue!.get(jobId);
          return { ...job, failure: job?.error };
        }
        if (method === "retry") {
          return { jobId, retried: await queue!.retry(jobId) };
        }
        if (method === "cancel") {
          return { jobId, outcome: await queue!.cancel(jobId) };
        }
        return queue!.list({ tasks: [task.name] });
      },
    });
    const { signal } = new AbortController();
    const failed = await client.get(id, signal);
    expect(failed.failure).toBe("handler-failed");
    await client.retry!(id, signal);
    const retried = await client.get(id, signal);
    expect(retried.state).toBe("pending");
    expect(await client.cancel!(id, signal)).toBe("cancelled");
    db.close();
    db = new Database(join(directory, "tasks.sqlite"));
    queue = await open();
    const cancelled = await client.get(id, signal);
    expect(cancelled.state).toBe("cancelled");
    const reportId = await queue.enqueue(report, {});
    await queue.runBatch({ maxJobs: 1 });
    db.close();
    db = new Database(join(directory, "tasks.sqlite"));
    queue = await open();
    const stored = await queue.get(reportId);
    expect(stored?.state).toBe("succeeded");
    expect(stored?.result).toEqual({ text: "Durable report" });
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
