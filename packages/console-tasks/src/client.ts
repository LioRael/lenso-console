import { z } from "zod";

export const jobSchema = z.object({
  jobId: z.string().uuid(),
  task: z.string(),
  state: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  cancelRequested: z.boolean(),
  failure: z
    .enum(["handler-failed", "invalid-input", "invalid-result", "aborted"])
    .nullable()
    .optional(),
});
export type Job = z.infer<typeof jobSchema>;
export const scheduleSchema = z.object({
  id: z.string().uuid(),
  task: z.string(),
  revision: z.number().int().positive(),
  state: z.enum(["active", "paused", "cancelled", "completed"]),
  nextAt: z.number().nullable(),
});
export type Schedule = z.infer<typeof scheduleSchema>;
export interface TaskClient {
  list(
    signal: AbortSignal,
    cursor?: string
  ): Promise<{ items: Job[]; nextCursor: string | null }>;
  get(
    id: string,
    signal: AbortSignal
  ): Promise<Job & { resultText?: string | undefined }>;
  retry?: (id: string, signal: AbortSignal) => Promise<void>;
  cancel?: (
    id: string,
    signal: AbortSignal
  ) => Promise<"cancelled" | "requested" | "terminal">;
  schedules?: (signal: AbortSignal) => Promise<Schedule[]>;
}
/** Bind the host's existing authorized Manage transport. No endpoints or credentials are created. */
export function createTaskClient(options: {
  invoke: (
    service: string,
    method: string,
    input: unknown,
    signal: AbortSignal
  ) => Promise<unknown>;
  tasks: string;
  scheduler?: string;
  retry?: boolean;
  cancel?: boolean;
}): TaskClient {
  const call = (method: string, input: unknown, signal: AbortSignal) =>
    options.invoke(options.tasks, method, input, signal);
  return {
    async list(signal, cursor) {
      return z
        .object({
          items: z.array(jobSchema).max(100),
          nextCursor: z.string().nullable(),
        })
        .parse(
          await call(
            "list",
            { limit: 50, ...(cursor ? { cursor } : {}) },
            signal
          )
        );
    },
    async get(jobId, signal) {
      return jobSchema
        .extend({
          jobId: z.literal(jobId),
          resultText: z.string().max(16000).optional(),
        })
        .parse(await call("get", { jobId }, signal));
    },
    ...(options.retry
      ? {
          async retry(jobId: string, signal: AbortSignal) {
            const result = z
              .object({ jobId: z.literal(jobId), retried: z.literal(true) })
              .parse(await call("retry", { jobId }, signal));
            if (!result.retried) {
              throw new Error("Retry was not accepted");
            }
          },
        }
      : {}),
    ...(options.cancel
      ? {
          async cancel(jobId: string, signal: AbortSignal) {
            return z
              .object({
                jobId: z.literal(jobId),
                outcome: z.enum(["cancelled", "requested", "terminal"]),
              })
              .parse(await call("cancel", { jobId }, signal)).outcome;
          },
        }
      : {}),
    ...(options.scheduler
      ? {
          async schedules(signal: AbortSignal) {
            return z
              .array(scheduleSchema)
              .max(100)
              .parse(
                await options.invoke(
                  options.scheduler!,
                  "list",
                  { limit: 50 },
                  signal
                )
              );
          },
        }
      : {}),
  };
}
