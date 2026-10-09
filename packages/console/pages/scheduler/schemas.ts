import { z } from "zod";

import { jobSummarySchema } from "../tasks/schemas";

export const scheduleRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at: z.number().int().nonnegative() }),
  z.object({
    kind: z.literal("cron"),
    expression: z.string(),
    timezone: z.string(),
  }),
]);

export const scheduleSummarySchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  task: z.string(),
  state: z.enum(["active", "paused", "cancelled", "completed"]),
  rule: scheduleRuleSchema,
  misfire: z.enum(["skip", "coalesce"]),
  graceMs: z.number().int().nonnegative(),
  nextAt: z.number().int().nonnegative().nullable(),
});

export const scheduleListSchema = z.array(scheduleSummarySchema);
export const scheduleTriggerSchema = z.object({ occurrenceId: z.string() });
export const schedulerCatalogSchema = z.object({
  tasks: z.array(
    z.object({
      name: z.string(),
      schemaAvailability: z.enum(["available", "runtime-validation-only"]),
      inputSchema: z.record(z.string(), z.unknown()).nullable(),
    })
  ),
});
export const scheduleCreateSchema = z.strictObject({
  task: z.string().min(1),
  input: z.unknown(),
  rule: scheduleRuleSchema,
  misfire: z.enum(["skip", "coalesce"]),
  graceMs: z.number().int().min(0).max(86_400_000),
});
export const occurrenceSchema = z.object({
  occurrence: z.object({
    id: z.string(),
    scheduleId: z.string().uuid(),
    revision: z.number().int().positive(),
    scheduledAt: z.number().int().nonnegative(),
    source: z.enum(["timer", "manual"]),
    task: z.string(),
    state: z.enum(["pending", "enqueued", "blocked"]),
    jobId: z.string().uuid().nullable(),
    error: z
      .enum([
        "dispatch-failed",
        "execution-denied",
        "job-expired",
        "dispatch-invalid",
      ])
      .nullable(),
  }),
  acceptance: z.enum(["confirmed", "unknown"]),
  job: jobSummarySchema.nullable(),
});
export const occurrencesSchema = z.array(occurrenceSchema);
export type ScheduleSummary = z.infer<typeof scheduleSummarySchema>;

export function schedulerErrorCode(error: unknown) {
  const parsed = z.object({ code: z.string() }).safeParse(error);
  return parsed.success ? parsed.data.code : undefined;
}
