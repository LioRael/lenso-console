import { describe, expect, test } from "bun:test";

import { auditGetSchema, auditPageSchema, auditQuerySchema } from "./contract";

describe("Audit browser projection", () => {
  test("strips scope and undeclared nested fields before query/get data enters the read cache", () => {
    const event = {
      id: "12345678-1234-1234-1234-123456789abc",
      occurredAt: 1000,
      recordedAt: 2000,
      scope: { tenantId: "tenant", scopeId: "scope" },
      actor: {
        kind: "service",
        realmId: "realm",
        subjectId: "subject",
        token: "hidden",
      },
      action: "tasks.run",
      target: { type: "task", id: "task-1", password: "hidden" },
      result: "success",
      reasonCode: "completed",
      summary: { affected: 1, credential: "hidden" },
      rawPayload: { private: true },
    };
    const parsed = auditPageSchema.parse({
      events: [event],
      nextCursor: { recordedAt: 2000, id: event.id, secret: "hidden" },
      total: 99,
    });
    expect(parsed.events[0]).toEqual({
      id: event.id,
      occurredAt: 1000,
      recordedAt: 2000,
      actor: { kind: "service", realmId: "realm", subjectId: "subject" },
      action: "tasks.run",
      target: { type: "task", id: "task-1" },
      result: "success",
      reasonCode: "completed",
      summary: { affected: 1 },
    });
    expect(parsed).not.toHaveProperty("total");
    expect(parsed.nextCursor).toEqual({ recordedAt: 2000, id: event.id });
    expect(auditGetSchema.parse(event)).toEqual(parsed.events[0]);
    expect(auditGetSchema.parse(null)).toBeNull();
    expect(
      auditQuerySchema.parse({
        action: "tasks.run",
        scope: event.scope,
        principal: "hidden",
      })
    ).toEqual({ action: "tasks.run" });
  });
});
