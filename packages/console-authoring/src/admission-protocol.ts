import { z } from "zod";

import { consoleWorkspaceSettingsSchema } from "./settings";

export const consolePageDescriptorSchema = z.strictObject({
  apiMajor: z.literal(1),
  protocol: z.literal("lenso-console-rpc/2"),
  id: z.string(),
  title: z.string(),
  targetId: z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/),
  subject: z.union([
    z.strictObject({ kind: z.literal("console") }),
    z.strictObject({ kind: z.literal("app"), appId: z.string() }),
  ]),
  owner: z.strictObject({
    instance: z.string(),
    source: z.literal("application"),
    trusted: z.literal(true),
  }),
  revision: z.string(),
  implementationId: z.string(),
  pageId: z.string().optional(),
  basePath: z.string().optional(),
  module: z.string(),
  styles: z.array(z.string()).readonly(),
  navigation: z.strictObject({
    label: z.string(),
    items: z
      .array(
        z.strictObject({
          label: z.string(),
          path: z.array(z.string()).readonly(),
        })
      )
      .readonly(),
  }),
  access: z.enum(["member", "administrator"]).optional(),
  settings: consoleWorkspaceSettingsSchema.optional(),
  index: z.array(z.string()).readonly().optional(),
  routes: z.array(z.array(z.string()).readonly()).readonly().optional(),
  credentials: z
    .strictObject({
      issuePath: z
        .string()
        .max(1024)
        .regex(/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/)
        .optional(),
      rotatePath: z
        .string()
        .max(1024)
        .regex(/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/)
        .optional(),
    })
    .optional(),
  requirements: z
    .array(
      z.strictObject({
        service_id: z.string(),
        capability_id: z.string(),
        descriptor_version: z.string(),
        operations: z.array(z.string()).readonly(),
        streaming_operations: z.array(z.string()).readonly().optional(),
        available: z.boolean(),
        required: z.boolean(),
        source: z.enum(["owner", "subject"]),
      })
    )
    .readonly(),
});

export type ConsolePageDescriptor = z.infer<typeof consolePageDescriptorSchema>;
/** Host composition supplies the route protocol and target before wire projection. */
export type ConsolePageAuthoringDescriptor = Omit<
  ConsolePageDescriptor,
  "protocol" | "targetId"
> & {
  protocol?: ConsolePageDescriptor["protocol"];
  targetId?: ConsolePageDescriptor["targetId"];
};

export const consoleSessionSchema = z.strictObject({
  mode: z.literal("required"),
  authenticated: z.literal(true),
  subject: z.string(),
  console_access: z.boolean(),
  administrator: z.boolean(),
  workspace_ids: z.array(z.string()).readonly(),
  assistant_enabled: z.literal(false),
  human_management_enabled: z.literal(false),
  management_enabled: z.boolean(),
  management_protocol: z.literal("lenso-console-rpc/2"),
  capabilities: z.strictObject({
    locale: z.enum(["available", "unavailable"]),
    pluginConfiguration: z.literal("read-only"),
    pluginConfigurationWrite: z.strictObject({
      available: z.literal(false),
      reason: z.string(),
    }),
    agent: z.strictObject({
      available: z.literal(false),
      reason: z.string(),
    }),
  }),
});
export type ConsoleSession = z.infer<typeof consoleSessionSchema>;

export const consolePageCatalogSchema = z.strictObject({
  schema: z.literal("console.page-catalog/1"),
  mounts: z.array(consolePageDescriptorSchema).readonly(),
});
export type ConsolePageCatalog = z.infer<typeof consolePageCatalogSchema>;

/** Static declarations only. They are not live readiness or invocation evidence. */
export const consoleOperationMetadataSchema = z.strictObject({
  source: z
    .strictObject({
      file: z.string().max(1024),
      export: z.string().max(128).optional(),
      line: z.number().int().positive().optional(),
      column: z.number().int().positive().optional(),
    })
    .nullable(),
  retry: z.enum(["safe", "unsafe", "unknown"]),
  cancellation: z.enum(["cooperative", "none", "request-only", "unknown"]),
  destructive: z.boolean().nullable(),
  outputDescription: z.string().max(4096).nullable(),
  outputContract: z.discriminatedUnion("availability", [
    z.strictObject({ availability: z.literal("unavailable") }),
    z.strictObject({
      availability: z.enum(["not-declared", "runtime-validation-only"]),
    }),
    z.strictObject({
      availability: z.literal("available"),
      schema: z.record(z.string(), z.unknown()),
    }),
  ]),
  errorContract: z.discriminatedUnion("availability", [
    z.strictObject({ availability: z.literal("unavailable") }),
    z.strictObject({
      availability: z.literal("declared"),
      errors: z
        .array(
          z.strictObject({
            code: z.string().min(1).max(128),
            message: z.string().max(1024),
          })
        )
        .max(32),
    }),
  ]),
});
export type ConsoleOperationMetadata = z.infer<
  typeof consoleOperationMetadataSchema
>;

export const consoleOperationDescriptorSchema = z.strictObject({
  key: z.string(),
  targetId: z.string(),
  pluginId: z.string(),
  method: z.string(),
  description: z.string(),
  effect: z.enum(["read", "write", "unknown"]),
  schemaAvailability: z.enum(["available", "runtime-validation-only"]),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  confirmation: z.boolean(),
  approval: z.boolean(),
  available: z.boolean(),
  unavailableReason: z.string().optional(),
  metadata: consoleOperationMetadataSchema.optional(),
});

export type ConsoleOperationDescriptor = z.infer<
  typeof consoleOperationDescriptorSchema
>;

export const consoleOperationCatalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.string(),
  operations: z.array(consoleOperationDescriptorSchema),
});
export type ConsoleOperationCatalog = z.infer<
  typeof consoleOperationCatalogSchema
>;
/** One finite entry read; current authority is still checked before disclosure. */
export const consoleAdmissionSchema = z.strictObject({
  schema: z.literal("console.admission/1"),
  session: consoleSessionSchema,
  pages: consolePageCatalogSchema,
  catalog: consoleOperationCatalogSchema.optional(),
});
export type ConsoleAdmission = z.infer<typeof consoleAdmissionSchema>;
