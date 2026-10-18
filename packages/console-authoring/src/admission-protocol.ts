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
