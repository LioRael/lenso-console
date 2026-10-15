import { z } from "zod";

const text = z.string().max(4096);
const identifier = z.string().min(1).max(256);

export const runtimeInspectionLimits = {
  manifestBytes: 262_144,
  metadataDepth: 24,
  metadataNodes: 16_384,
  catalogueServices: 64,
  methodsPerService: 64,
  statusServices: 256,
  statusCalls: 1024,
  greetingName: 80,
  greetingMessage: 512,
  greetingTimeoutMs: 2000,
} as const;

/** Bound work before a recursive schema parser visits JSON from a manifest or RPC. */
export function isBoundedRuntimeMetadata(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  let bytes = 0;
  while (pending.length) {
    const next = pending.pop()!;
    nodes += 1;
    if (
      nodes > runtimeInspectionLimits.metadataNodes ||
      next.depth > runtimeInspectionLimits.metadataDepth
    ) {
      return false;
    }
    if (typeof next.value === "string") {
      bytes += next.value.length * 3;
    } else if (typeof next.value === "object" && next.value !== null) {
      if (
        Array.isArray(next.value) &&
        next.value.length > runtimeInspectionLimits.metadataNodes
      ) {
        return false;
      }
      for (const key in next.value) {
        if (!Object.hasOwn(next.value, key)) {
          continue;
        }
        if (pending.length >= runtimeInspectionLimits.metadataNodes) {
          return false;
        }
        bytes += key.length * 3;
        const child = (next.value as Record<string, unknown>)[key];
        pending.push({ value: child, depth: next.depth + 1 });
      }
    } else if (
      next.value !== null &&
      typeof next.value !== "boolean" &&
      !(typeof next.value === "number" && Number.isFinite(next.value))
    ) {
      return false;
    }
    if (bytes > runtimeInspectionLimits.manifestBytes) {
      return false;
    }
  }
  return true;
}

const boundedMetadata = z
  .unknown()
  .refine(
    isBoundedRuntimeMetadata,
    "Runtime metadata exceeds inspection limits."
  );

export interface RuntimeSchemaNode {
  type?:
    | "string"
    | "boolean"
    | "number"
    | "integer"
    | "null"
    | "object"
    | "array"
    | undefined;
  properties?: Record<string, RuntimeSchemaNode> | undefined;
  required?: string[] | undefined;
  additionalProperties?: false | undefined;
  items?: RuntimeSchemaNode | undefined;
  enum?: (string | number | boolean | null)[] | undefined;
  minimum?: number | undefined;
  maximum?: number | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  minItems?: number | undefined;
  maxItems?: number | undefined;
  anyOf?: RuntimeSchemaNode[] | undefined;
}

const schemaNode: z.ZodType<RuntimeSchemaNode> = z.lazy(() =>
  z.object({
    type: z
      .enum([
        "string",
        "boolean",
        "number",
        "integer",
        "null",
        "object",
        "array",
      ])
      .optional(),
    properties: z.record(identifier, schemaNode).optional(),
    required: z.array(identifier).max(256).optional(),
    additionalProperties: z.literal(false).optional(),
    items: schemaNode.optional(),
    enum: z
      .array(z.union([text, z.number(), z.boolean(), z.null()]))
      .max(64)
      .optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    minItems: z.number().int().nonnegative().optional(),
    maxItems: z.number().int().nonnegative().optional(),
    anyOf: z.array(schemaNode).length(2).optional(),
  })
);

export const runtimeCatalogueServiceSchema = z.object({
  namespace: identifier,
  service: identifier,
  contract: z.object({
    version: identifier,
    methods: z
      .record(
        identifier,
        z.object({
          mode: z.enum(["unary", "stream"]),
          input: schemaNode,
          output: schemaNode,
          error: schemaNode,
        })
      )
      .refine(
        (methods) =>
          Object.keys(methods).length <=
          runtimeInspectionLimits.methodsPerService
      ),
  }),
});

export const runtimeGreetingTargetSchema = z.strictObject({
  namespace: identifier,
  service: identifier,
  contractVersion: identifier,
});

export const runtimeCatalogueSchema = boundedMetadata.pipe(
  z.object({
    source: z.literal("static-build-manifest"),
    availability: z.literal("unverified"),
    configured: z.boolean(),
    services: z
      .array(runtimeCatalogueServiceSchema)
      .max(runtimeInspectionLimits.catalogueServices),
    greetingTrial: z.discriminatedUnion("enabled", [
      z.object({ enabled: z.literal(false) }),
      z.object({
        enabled: z.literal(true),
        target: runtimeGreetingTargetSchema,
        method: z.literal("greet"),
        timeoutMs: z.literal(runtimeInspectionLimits.greetingTimeoutMs),
      }),
    ]),
  })
);

export const runtimeGreetingInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(runtimeInspectionLimits.greetingName),
});
export const runtimeGreetingResultSchema = z.strictObject({
  message: z.string().min(1).max(runtimeInspectionLimits.greetingMessage),
});

export type RuntimeCatalogue = z.infer<typeof runtimeCatalogueSchema>;
export type RuntimeGreetingInput = z.infer<typeof runtimeGreetingInputSchema>;
export type RuntimeGreetingResult = z.infer<typeof runtimeGreetingResultSchema>;

const call = z.object({
  id: text,
  namespace: text,
  service: text,
  method: text,
  trace_id: text.nullish(),
  parent_id: text.nullish(),
});

export const runtimeSnapshotSchema = boundedMetadata.pipe(
  z.object({
    services: z
      .array(
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
          capabilities: z
            .array(z.object({ method: text, mode: text }))
            .max(256),
        })
      )
      .max(runtimeInspectionLimits.statusServices),
    calls: z
      .array(
        call.extend({
          state: z.enum(["active", "waiting"]),
          remaining_ms: z.number().nonnegative(),
        })
      )
      .max(runtimeInspectionLimits.statusCalls),
    recent: z
      .array(
        call.extend({
          outcome: text,
          code: text.nullish(),
          duration_ms: z.number().nonnegative(),
        })
      )
      .max(64),
  })
);

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;

/** Project metadata only; unknown fields, including any payload, are discarded. */
export function projectRuntimeSnapshot(status: unknown): RuntimeSnapshot {
  return runtimeSnapshotSchema.parse(status);
}
