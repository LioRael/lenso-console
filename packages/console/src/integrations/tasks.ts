import { definePlugin, type Plugin } from "@lenso/core";
import { defineOperation, type Operation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import {
  TaskQueueError,
  type JobStatus,
  type JobSummary,
  type Task,
  type TaskQueue,
} from "@lenso/tasks";
import { z } from "zod";

import { ConsoleOperationError } from "../errors";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleOptions,
  ConsoleResource,
} from "../types";

export interface ConsoleTaskContext {
  readonly identity: ConsoleIdentity;
  readonly resource: ConsoleResource;
  readonly request: Request;
}

export interface ConsoleTasksOptions {
  readonly id: string;
  readonly queue: Plugin<TaskQueue>;
  readonly authentication: Plugin<ConsoleAuthentication>;
  readonly tasks: readonly Pick<
    Task,
    "name" | "input" | "maxAttempts" | "retry"
  >[];
  /** Must verify target, tenant and job ownership, not just the job's task name. */
  readonly authorizeJob: (
    trusted: ConsoleTaskContext,
    job: JobStatus,
    action: "list" | "get" | "retry" | "cancel"
  ) => boolean | Promise<boolean>;
  /** Explicit replay-safety policy for this exact registered task and persisted job. */
  readonly safeRetry?: (
    trusted: ConsoleTaskContext,
    task: Pick<Task, "name" | "input" | "maxAttempts" | "retry">,
    job: JobStatus
  ) => boolean | Promise<boolean>;
}

const jobInput = z.strictObject({ jobId: z.string().uuid() });
const listInput = z.strictObject({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(256).optional(),
});

function summary(job: JobStatus): JobSummary {
  return {
    jobId: job.jobId,
    task: job.task,
    state: job.state,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    cancelRequested: job.cancelRequested,
  };
}

function translate(error: unknown): never {
  if (error instanceof TaskQueueError) {
    switch (error.code) {
      case "unsupported": {
        throw new ConsoleOperationError("NOT_IMPLEMENTED");
      }
      case "invalid-options":
      case "invalid-task":
      case "invalid-input": {
        throw new ConsoleOperationError("UNPROCESSABLE_CONTENT");
      }
      case "deduplication-conflict":
      case "job-expired": {
        throw new ConsoleOperationError("CONFLICT");
      }
      default: {
        throw new ConsoleOperationError("SERVICE_UNAVAILABLE", {
          cause: error,
        });
      }
    }
  }
  throw error;
}

/** Borrows a queue. It never starts workers or acquires queue cleanup ownership. */
export function createConsoleTasksIntegration(options: ConsoleTasksOptions) {
  const tasks = new Map(options.tasks.map((task) => [task.name, task]));
  if (tasks.size !== options.tasks.length || tasks.size === 0) {
    throw new TypeError(
      "Console tasks require a nonempty unique task whitelist"
    );
  }
  const names = [...tasks.keys()];
  // Provider cursors can identify denied jobs. Encrypt rather than expose or merely encode them.
  // Tokens are scoped to the installed service lifetime and authenticated host resource.
  function cursorScope(context: ConsoleTaskContext) {
    const { identity, resource } = context;
    return new TextEncoder().encode(
      JSON.stringify([
        options.id,
        resource.targetId,
        resource.tenantId,
        resource.mountId ?? null,
        identity.readScope,
        identity.actor.realmId,
        identity.actor.subjectId,
        identity.actor.audience,
      ])
    );
  }
  async function encodeCursor(
    after: string,
    context: ConsoleTaskContext,
    cursorKey: CryptoKey
  ) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: cursorScope(context) },
      cursorKey,
      new TextEncoder().encode(after)
    );
    const bytes = new Uint8Array(iv.length + encrypted.byteLength);
    bytes.set(iv);
    bytes.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCodePoint(...bytes));
  }
  async function decodeCursor(
    cursor: string,
    context: ConsoleTaskContext,
    cursorKey: CryptoKey
  ) {
    try {
      const bytes = Uint8Array.from(atob(cursor), (char) =>
        char.codePointAt(0)!
      );
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes.slice(0, 12),
          additionalData: cursorScope(context),
        },
        cursorKey,
        bytes.slice(12)
      );
      return z.string().uuid().parse(new TextDecoder().decode(decrypted));
    } catch {
      throw new ConsoleOperationError("UNPROCESSABLE_CONTENT");
    }
  }
  const plugin = definePlugin({
    id: options.id,
    requires: [options.queue, options.authentication],
    async setup(lifecycle) {
      const queue = lifecycle.get(options.queue);
      const authentication = lifecycle.get(options.authentication);
      const cursorKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
      async function enforce(context: ConsoleTaskContext, method: string) {
        context.request.signal.throwIfAborted();
        if (
          context.resource.action !== "invoke" ||
          context.resource.pluginId !== options.id ||
          context.resource.operation !== method
        ) {
          throw new ConsoleOperationError("FORBIDDEN");
        }
        await authentication.enforce(context.identity, context.resource);
        context.request.signal.throwIfAborted();
      }
      async function permitted(
        context: ConsoleTaskContext,
        job: JobStatus,
        action: "list" | "get" | "retry" | "cancel"
      ) {
        const allowed =
          tasks.has(job.task) &&
          (await options.authorizeJob(context, job, action)) === true;
        context.request.signal.throwIfAborted();
        return allowed;
      }
      async function load(
        jobId: string,
        context: ConsoleTaskContext,
        action: "get" | "retry" | "cancel"
      ) {
        const job = await queue.get(jobId);
        if (!job || !(await permitted(context, job, action))) {
          throw new ConsoleOperationError("NOT_FOUND");
        }
        return job;
      }
      async function run<T>(execute: () => Promise<T>): Promise<T> {
        try {
          return await execute();
        } catch (error) {
          translate(error);
        }
      }
      return {
        list(input: z.input<typeof listInput>, context: ConsoleTaskContext) {
          return run(async () => {
            const validated = listInput.parse(input);
            await enforce(context, "list");
            const after = validated.cursor
              ? await decodeCursor(validated.cursor, context, cursorKey)
              : undefined;
            // One bounded provider page, no unbounded refill and no invented filtered count.
            const page = await queue.list({
              tasks: names,
              limit: validated.limit,
              after,
            });
            const items: JobSummary[] = [];
            for (const candidate of page.items) {
              const job = await queue.get(candidate.jobId);
              if (job && (await permitted(context, job, "list"))) {
                items.push(summary(job));
              }
            }
            const nextCursor =
              page.nextCursor === null
                ? null
                : await encodeCursor(page.nextCursor, context, cursorKey);
            await enforce(context, "list");
            return { items, nextCursor };
          });
        },
        get(input: z.input<typeof jobInput>, context: ConsoleTaskContext) {
          return run(async () => {
            const { jobId } = jobInput.parse(input);
            await enforce(context, "get");
            const job = await load(jobId, context, "get");
            await enforce(context, "get");
            return {
              ...summary(job),
              failure: [
                "handler-failed",
                "invalid-input",
                "invalid-result",
                "aborted",
              ].includes(job.error ?? "")
                ? job.error
                : null,
            };
          });
        },
        retry(input: z.input<typeof jobInput>, context: ConsoleTaskContext) {
          return run(async () => {
            const { jobId } = jobInput.parse(input);
            await enforce(context, "retry");
            const job = await load(jobId, context, "retry");
            if (
              !options.safeRetry ||
              (await options.safeRetry(context, tasks.get(job.task)!, job)) !==
                true
            ) {
              throw new ConsoleOperationError("FORBIDDEN");
            }
            await enforce(context, "retry");
            if (!(await permitted(context, job, "retry"))) {
              throw new ConsoleOperationError("NOT_FOUND");
            }
            if (job.state !== "failed" || !(await queue.retry(jobId))) {
              throw new ConsoleOperationError("CONFLICT");
            }
            return { jobId, retried: true };
          });
        },
        cancel(input: z.input<typeof jobInput>, context: ConsoleTaskContext) {
          return run(async () => {
            const { jobId } = jobInput.parse(input);
            await enforce(context, "cancel");
            await load(jobId, context, "cancel");
            await enforce(context, "cancel");
            const outcome = await queue.cancel(jobId);
            if (outcome === "missing") {
              throw new ConsoleOperationError("NOT_FOUND");
            }
            return { jobId, outcome };
          });
        },
      };
    },
  });
  const read = {
    effect: "read",
    destructive: false,
    retry: "safe",
    cancellation: "cooperative",
  } as const;
  const write = {
    effect: "write",
    destructive: false,
    retry: "unsafe",
    cancellation: "request-only",
  } as const;
  const operations = [
    defineOperation({
      plugin,
      method: "list",
      input: listInput,
      context: true,
      ...read,
      description: "List authorized jobs from one bounded provider page.",
    }),
    defineOperation({
      plugin,
      method: "get",
      input: jobInput,
      context: true,
      ...read,
      description: "Read an authorized job summary without payload or result.",
    }),
    defineOperation({
      plugin,
      method: "retry",
      input: jobInput,
      context: true,
      ...write,
      description:
        "Retry a failed job only under the host's explicit replay-safety policy.",
    }),
    defineOperation({
      plugin,
      method: "cancel",
      input: jobInput,
      context: true,
      ...write,
      description: "Request cancellation of an authorized job.",
    }),
  ] as const;
  const manage = defineManage({ plugin, operations });
  const binding = (
    operation: Operation,
    _input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    resource: ConsoleResource
  ) => {
    if (
      !operations.some((declared: Operation) => declared === operation) ||
      resource.action !== "invoke" ||
      resource.pluginId !== plugin.id ||
      resource.operation !== operation.method
    ) {
      throw new ConsoleOperationError("FORBIDDEN");
    }
    request.signal.throwIfAborted();
    return { context: { identity, resource, request }, signal: request.signal };
  };
  return {
    plugin,
    operations,
    manage,
    binding: binding satisfies ConsoleOptions["binding"],
  };
}
