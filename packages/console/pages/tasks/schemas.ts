import { z } from "zod";

export const jobSummarySchema = z.object({
  jobId: z.string().uuid(),
  task: z.string(),
  state: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  cancelRequested: z.boolean(),
});

export const taskListSchema = z.object({
  items: z.array(jobSummarySchema),
  nextCursor: z.string().nullable(),
});
export const taskRetrySchema = z.object({
  jobId: z.string().uuid(),
  retried: z.boolean(),
});
export const taskCancelSchema = z.object({
  jobId: z.string().uuid(),
  outcome: z.enum(["cancelled", "requested", "terminal", "missing"]),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;
export const jobDetailSchema = jobSummarySchema.extend({
  failure: z
    .enum(["handler-failed", "invalid-input", "invalid-result", "aborted"])
    .nullable()
    .optional(),
});
