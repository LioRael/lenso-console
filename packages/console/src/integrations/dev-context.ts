import {
  consoleOperationInspectionSchema,
  type ConsoleOperationInspection,
} from "@lenso/console-sdk/protocol";
import { definePlugin, type Plugin } from "@lenso/core/plugin";
import { boundedJson } from "@lenso/engine/operations";
import { z } from "zod";

import { ConsoleRequestError } from "../auth";
import { failure } from "../boundary";
import { projectOperationMetadata } from "../operation-metadata";
import type {
  ConsoleAuthentication,
  ConsoleOperationInspector,
  ConsoleOperationInspectionRequest,
} from "../types";

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:@/-]+$/);
const codeRevisionSchema = z.object({
  kind: z.literal("watched-inputs-sha256"),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  verifiedLoadedBytes: z.literal(false),
});
const operationSchema = z.object({
  pluginId: id,
  method: id,
  source: z.object({
    file: z.string().max(1024),
    export: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
  }),
  outputSchemaAvailability: z.enum([
    "not-declared",
    "available",
    "runtime-validation-only",
  ]),
  outputSchema: z.record(z.string(), z.unknown()).nullable(),
  errors: z
    .array(z.object({ code: id, message: z.string().max(1024) }))
    .max(32),
});
const inspectionSchema = z.object({
  inspection: z.literal("running"),
  instanceId: id,
  generation: id,
  provenance: z.object({ codeRevision: codeRevisionSchema }),
  operations: z.array(operationSchema).max(256),
});
const recentSchema = z.object({
  generation: id,
  retention: z.object({
    durable: z.literal(false),
    payloads: z.literal(false),
    maxEntries: z.number().int().max(64),
    maxAgeMs: z.number().int().max(300000),
  }),
  calls: z
    .array(
      z.object({
        id,
        callRef: id,
        pluginId: id,
        method: id,
        instanceId: id,
        generation: id,
        codeRevision: codeRevisionSchema,
        outcome: z.enum(["success", "failure"]),
        code: id,
        phase: id,
        effectState: z.enum(["not-started", "unknown", "completed"]),
        startedAt: z.number().nonnegative(),
        durationMs: z.number().nonnegative(),
      })
    )
    .max(16),
});

export interface ConsoleDevContextConnection {
  /** Host-selected private descriptor. The adapter is allowed to inspect/recent only, never call. */
  read(
    action: "inspect" | "recent",
    options: {
      generation?: string;
      pluginId?: string;
      method?: string;
      limit?: number;
      signal: AbortSignal;
    }
  ): Promise<unknown>;
}
export interface ConsoleDevOperationBinding {
  targetId: string;
  mountId: string;
  revision: string;
  service: string;
  name: string;
  ownerPluginId: string;
  ownerMethod: string;
  devPluginId: string;
  devMethod: string;
}
/** Reads the TS owner's existing generation-fenced provider. Does not create a collector or socket. */
export function createConsoleDevOperationInspector(options: {
  id: string;
  authentication: Plugin<ConsoleAuthentication>;
  connection: Plugin<ConsoleDevContextConnection>;
  bindings: readonly ConsoleDevOperationBinding[];
}): Plugin<ConsoleOperationInspector> {
  if (options.bindings.length > 256) {
    throw new Error("Too many operation bindings.");
  }
  const bindings = options.bindings.map((binding) =>
    Object.freeze({ ...binding })
  );
  const keys = bindings.map(
    ({
      targetId,
      mountId,
      revision,
      service,
      name,
      ownerPluginId,
      ownerMethod,
    }) =>
      JSON.stringify([
        targetId,
        mountId,
        revision,
        service,
        name,
        ownerPluginId,
        ownerMethod,
      ])
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("Duplicate operation binding.");
  }
  return definePlugin({
    id: options.id,
    requires: [options.authentication, options.connection],
    setup(context) {
      const auth = context.get(options.authentication);
      const connection = context.get(options.connection);
      return {
        async read(query: ConsoleOperationInspectionRequest) {
          const enforce = async () => {
            query.request.signal.throwIfAborted();
            const current = await auth.authenticate(query.request);
            const session = await auth.session(current);
            if (
              current.readScope !== query.identity.readScope ||
              current.actor.subjectId !== query.identity.actor.subjectId ||
              current.actor.realmId !== query.identity.actor.realmId ||
              current.actor.audience !== query.identity.actor.audience ||
              current.actor.kind !== query.identity.actor.kind ||
              !session.administrator
            ) {
              throw new ConsoleRequestError("forbidden");
            }
            await auth.enforce(current, { ...query.resource, action: "admin" });
          };
          await enforce();
          const binding = bindings.find(
            (item) =>
              item.targetId === query.targetId &&
              item.mountId === query.mountId &&
              item.revision === query.revision &&
              item.service === query.service &&
              item.name === query.name &&
              item.ownerPluginId === query.operation.plugin.id &&
              item.ownerMethod === query.operation.method
          );
          const runtime = {
            availability: "unavailable" as const,
            reason: "runtime-binding-not-configured" as const,
          };
          if (!binding) {
            return {
              runtime,
              recentFailures: {
                availability: "unavailable" as const,
                reason: "collector-not-configured" as const,
              },
            };
          }
          const { signal } = query.request;
          const inspect = async () => {
            const value = await connection.read("inspect", {
              signal,
              pluginId: binding.devPluginId,
              method: binding.devMethod,
            });
            boundedJson(value, 262144);
            return inspectionSchema.parse(value);
          };
          const before = await inspect();
          const selected = before.operations.find(
            (operation) =>
              operation.pluginId === binding.devPluginId &&
              operation.method === binding.devMethod
          );
          if (!selected) {
            throw new ConsoleRequestError("forbidden");
          }
          const value = await connection.read("recent", {
            signal,
            generation: before.generation,
            pluginId: binding.devPluginId,
            method: binding.devMethod,
            limit: 16,
          });
          boundedJson(value, 65536);
          const recent = recentSchema.parse(value);
          const after = await inspect();
          await enforce();
          if (
            recent.generation !== before.generation ||
            after.generation !== before.generation ||
            after.instanceId !== before.instanceId ||
            after.provenance.codeRevision.digest !==
              before.provenance.codeRevision.digest
          ) {
            throw failure("CONFLICT", 409);
          }
          const rows = recent.calls.filter((row) => row.outcome === "failure");
          if (
            rows.some(
              (row) =>
                row.instanceId !== before.instanceId ||
                row.generation !== before.generation ||
                row.codeRevision.digest !==
                  before.provenance.codeRevision.digest ||
                row.pluginId !== binding.devPluginId ||
                row.method !== binding.devMethod
            )
          ) {
            throw failure("CONFLICT", 409);
          }
          return consoleOperationInspectionSchema.parse({
            runtime,
            execution: {
              source: "ts-dev-supervisor",
              instanceId: before.instanceId,
              generation: before.generation,
              codeRevision: before.provenance.codeRevision,
              operationSource: projectOperationMetadata({
                source: selected.source,
              }).source,
              outputSchemaAvailability: selected.outputSchemaAvailability,
              outputSchema: selected.outputSchema,
              errors: selected.errors,
            },
            recentFailures: {
              availability: "available",
              source: "dev-collector",
              durable: false,
              instanceId: before.instanceId,
              generation: before.generation,
              references: rows.map((row) => ({
                id: row.callRef,
                pluginId: row.pluginId,
                method: row.method,
                code: row.code,
                phase: row.phase,
                effectState: row.effectState,
                startedAt: row.startedAt,
                durationMs: row.durationMs,
              })),
            },
          });
        },
      };
    },
  });
}

/** Explicitly compose independently authorized read adapters; no cached identity or catalog. */
export function combineConsoleOperationInspectors(options: {
  id: string;
  inspectors: readonly Plugin<ConsoleOperationInspector>[];
}): Plugin<ConsoleOperationInspector> {
  if (options.inspectors.length > 4) {
    throw new Error("Too many operation inspectors.");
  }
  return definePlugin({
    id: options.id,
    requires: [...options.inspectors],
    setup(context) {
      const inspectors = options.inspectors.map((plugin) =>
        context.get(plugin)
      );
      return {
        async read(query: ConsoleOperationInspectionRequest) {
          const result: ConsoleOperationInspection = {
            runtime: {
              availability: "unavailable",
              reason: "runtime-binding-not-configured",
            },
            recentFailures: {
              availability: "unavailable",
              reason: "collector-not-configured",
            },
          };
          for (const inspector of inspectors) {
            const next = consoleOperationInspectionSchema.parse(
              await inspector.read(query)
            );
            if (next.runtime.availability === "measured") {
              if (result.runtime.availability === "measured") {
                throw new Error("Ambiguous Runtime inspection.");
              }
              result.runtime = next.runtime;
            }
            if (next.recentFailures.availability === "available") {
              if (result.recentFailures.availability === "available") {
                throw new Error("Ambiguous collector inspection.");
              }
              result.recentFailures = next.recentFailures;
            }
            if (next.execution) {
              if (result.execution) {
                throw new Error("Ambiguous execution inspection.");
              }
              result.execution = next.execution;
            }
          }
          query.request.signal.throwIfAborted();
          return result;
        },
      };
    },
  });
}
