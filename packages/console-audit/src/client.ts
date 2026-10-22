import { z } from "zod";

const id = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const text = z.string().min(1).max(512);
export const auditResult = z.enum([
  "intent",
  "success",
  "failure",
  "denied",
  "unknown",
]);
export const auditCursor = z
  .object({ recordedAt: z.number().int().nonnegative(), id })
  .strict();
export const auditFilter = z
  .object({
    action: text.optional(),
    target: z.object({ type: text, id: text }).strict().optional(),
    result: auditResult.optional(),
    correlationId: text.optional(),
  })
  .strict();
// A deliberate metadata projection: no raw payload, actor, scope or arbitrary summary.
export const auditEvent = z.object({
  id,
  recordedAt: z.number().int().nonnegative(),
  occurredAt: z.number().int().nonnegative(),
  action: text,
  target: z.object({ type: text, id: text }),
  result: auditResult,
  reasonCode: text,
  correlationId: text.optional(),
  relation: z
    .object({ kind: z.enum(["outcome", "correction"]), eventId: id })
    .optional(),
});
export type AuditFilter = z.infer<typeof auditFilter>;
export type AuditEvent = z.infer<typeof auditEvent>;
export type AuditCursor = z.infer<typeof auditCursor>;
export interface AuditClient {
  query(
    filter: AuditFilter,
    signal: AbortSignal,
    cursor?: AuditCursor
  ): Promise<{ events: AuditEvent[]; nextCursor: AuditCursor | null }>;
  get(id: string, signal: AbortSignal): Promise<AuditEvent | null>;
}
/** The selected host supplies an already authorized, exact service transport. Scope is server-owned. */
export function createAuditClient(options: {
  service: string;
  invoke(
    service: string,
    method: string,
    input: unknown,
    signal: AbortSignal
  ): Promise<unknown>;
}): AuditClient {
  return {
    async query(filter, signal, cursor) {
      const input = {
        ...auditFilter.parse(filter),
        limit: 50,
        ...(cursor ? { cursor: auditCursor.parse(cursor) } : {}),
      };
      return z
        .object({
          events: z.array(auditEvent).max(100),
          nextCursor: auditCursor.nullable(),
        })
        .parse(await options.invoke(options.service, "query", input, signal));
    },
    async get(eventId, signal) {
      id.parse(eventId);
      return auditEvent
        .extend({ id: z.literal(eventId) })
        .nullable()
        .parse(
          await options.invoke(options.service, "get", { id: eventId }, signal)
        );
    },
  };
}
