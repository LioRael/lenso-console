import { z } from "zod";

const identifier = (max = 128) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
    .refine((value) => !value.includes("://"));
const eventId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const unsafeSummaryKey =
  /secret|password|token|credential|cookie|authorization|digest|hash|body|payload|email|phone|address|__proto__|constructor|prototype/i;

export const auditResultSchema = z.enum([
  "intent",
  "success",
  "failure",
  "denied",
  "unknown",
]);
export const auditCursorSchema = z.object({
  recordedAt: timestamp,
  id: eventId,
});
export const auditEventSchema = z.object({
  id: eventId,
  occurredAt: timestamp,
  recordedAt: timestamp,
  actor: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("system"), systemId: identifier() }),
    z.object({
      kind: z.enum(["user", "guest", "service"]),
      realmId: identifier(),
      subjectId: identifier(),
    }),
  ]),
  action: identifier(),
  target: z.object({ type: identifier(64), id: identifier(256) }),
  result: auditResultSchema,
  reasonCode: identifier(64),
  correlationId: identifier().optional(),
  summary: z
    .record(z.string(), z.union([z.boolean(), z.number().finite(), z.string()]))
    .transform((summary) =>
      Object.fromEntries(
        Object.entries(summary).filter(([key]) => !unsafeSummaryKey.test(key))
      )
    ),
  relation: z
    .object({
      kind: z.enum(["correction", "outcome"]),
      eventId,
    })
    .optional(),
});
export const auditPageSchema = z.object({
  events: z.array(auditEventSchema),
  nextCursor: auditCursorSchema.nullable(),
});
export const auditGetSchema = auditEventSchema.nullable();
export const auditQuerySchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional(),
    cursor: auditCursorSchema.optional(),
    action: identifier().optional(),
    target: z.object({ type: identifier(64), id: identifier(256) }).optional(),
    result: auditResultSchema.optional(),
    correlationId: identifier().optional(),
    recordedFrom: timestamp.optional(),
    recordedTo: timestamp.optional(),
  })
  .refine(
    (input) =>
      input.recordedFrom === undefined ||
      input.recordedTo === undefined ||
      input.recordedFrom <= input.recordedTo,
    { message: "The start time must not be after the end time." }
  );

export type AuditResult = z.infer<typeof auditResultSchema>;
export type AuditCursor = z.infer<typeof auditCursorSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
