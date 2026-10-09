import { describe, expect, test } from "bun:test";

import {
  jobSummarySchema,
  taskCancelSchema,
  taskListSchema,
  type JobSummary,
} from "./schemas";

const job: JobSummary = {
  jobId: "d623b53d-81ea-4b03-851d-4b3703b07e28",
  task: "sync",
  state: "running",
  attempt: 1,
  maxAttempts: 3,
  cancelRequested: true,
};

describe("Tasks browser DTO boundary", () => {
  test("selects only the six safe fields before cache insertion", () => {
    expect(
      jobSummarySchema.parse({
        ...job,
        input: { secret: "not-for-cache" },
        result: { private: "not-for-cache" },
        error: "private runtime failure",
        initiator: { subjectId: "private subject" },
      })
    ).toEqual(job);
  });

  test("preserves continuation even when a provider page has no visible jobs", () => {
    expect(
      taskListSchema.parse({ items: [], nextCursor: "opaque-cursor" })
    ).toEqual({ items: [], nextCursor: "opaque-cursor" });
  });

  test("accepts cancellation requested without claiming a terminal state", () => {
    expect(jobSummarySchema.parse(job).state).toBe("running");
    expect(
      taskCancelSchema.parse({ jobId: job.jobId, outcome: "requested" }).outcome
    ).toBe("requested");
    expect(
      taskCancelSchema.safeParse({ jobId: job.jobId, outcome: "success" })
        .success
    ).toBe(false);
  });
});
