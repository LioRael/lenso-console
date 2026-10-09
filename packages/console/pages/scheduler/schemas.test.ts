import { describe, expect, test } from "bun:test";

import type { z } from "zod";

import {
  type occurrenceSchema,
  occurrencesSchema,
  scheduleSummarySchema,
  schedulerCatalogSchema,
  type ScheduleSummary,
} from "./schemas";

const id = "d623b53d-81ea-4b03-851d-4b3703b07e28";
const schedule: ScheduleSummary = {
  id,
  revision: 2,
  task: "sync",
  state: "active",
  rule: { kind: "cron", expression: "0 * * * *", timezone: "UTC" },
  misfire: "skip",
  graceMs: 0,
  nextAt: 1_800_000_000_000,
};

describe("Scheduler browser DTO boundary", () => {
  test("drops durable initiators and task inputs from schedule summaries", () => {
    expect(
      scheduleSummarySchema.parse({
        ...schedule,
        input: { secret: "private" },
        initiator: { realmId: "private", subjectId: "private" },
      })
    ).toEqual(schedule);
  });

  test("drops occurrence actor and payload while preserving unknown acceptance", () => {
    const safe: z.infer<typeof occurrenceSchema>["occurrence"] = {
      id: "occurrence",
      scheduleId: id,
      revision: 2,
      scheduledAt: 1_800_000_000_000,
      source: "manual",
      task: "sync",
      state: "pending",
      jobId: null,
      error: null,
    };
    expect(
      occurrencesSchema.parse([
        {
          occurrence: {
            ...safe,
            input: { secret: "private" },
            initiator: { subjectId: "private" },
            leaseToken: "private",
          },
          acceptance: "unknown",
          job: null,
        },
      ])
    ).toEqual([{ occurrence: safe, acceptance: "unknown", job: null }]);
  });

  test("represents runtime-only registration without inventing an input schema", () => {
    const tasks: z.infer<typeof schedulerCatalogSchema>["tasks"] = [
      {
        name: "sync",
        schemaAvailability: "runtime-validation-only",
        inputSchema: null,
      },
    ];
    expect(schedulerCatalogSchema.parse({ tasks })).toEqual({ tasks });
    expect(
      schedulerCatalogSchema.safeParse({
        tasks: [
          { name: "sync", schemaAvailability: "invented", inputSchema: null },
        ],
      }).success
    ).toBe(false);
  });
});
