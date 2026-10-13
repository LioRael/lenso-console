import { z } from "zod";

const text = z.string().max(4096);
const call = z.object({
  id: text,
  namespace: text,
  service: text,
  method: text,
  trace_id: text.nullish(),
  parent_id: text.nullish(),
});

export const runtimeSnapshotSchema = z.object({
  services: z.array(
    z.object({
      namespace: text,
      service: text,
      instance: text,
      generation: text,
      contract_version: text.nullish(),
      state: z.enum([
        "connected",
        "registered",
        "ready",
        "draining",
        "drained",
      ]),
      active_calls: z.number().int().nonnegative(),
      max_concurrency: z.number().int().nonnegative(),
      capabilities: z.array(z.object({ method: text, mode: text })),
    })
  ),
  calls: z.array(
    call.extend({
      state: z.enum(["active", "waiting"]),
      remaining_ms: z.number().nonnegative(),
    })
  ),
  recent: z
    .array(
      call.extend({
        outcome: text,
        code: text.nullish(),
        duration_ms: z.number().nonnegative(),
      })
    )
    .max(64),
});

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;

/** Project metadata only; unknown fields, including any payload, are discarded. */
export function projectRuntimeSnapshot(status: unknown): RuntimeSnapshot {
  return runtimeSnapshotSchema.parse(status);
}
