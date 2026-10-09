import {
  asyncIteratorObject,
  oc,
  type,
  type RouterContractClient,
} from "@orpc/contract";
import { z } from "zod";

export { consoleHttpPathsSchema } from "./http-paths";
export type {
  ConsoleHttpPaths,
  WorkspaceSource,
  WorkspaceNavigationCheck,
} from "./http-paths";

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
});

export type ConsoleOperationDescriptor = z.infer<
  typeof consoleOperationDescriptorSchema
>;

export type ConsolePluginDescriptor = z.infer<
  typeof consolePluginDescriptorSchema
>;

export type ConsoleTargetDescriptor = z.infer<
  typeof consoleTargetDescriptorSchema
>;

export const consoleTargetDescriptorSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
});

export const consolePluginDescriptorSchema = z.strictObject({
  id: z.string(),
  targetId: z.string(),
  configuration: z.strictObject({
    state: z.enum(["unconfigured", "resolved", "unavailable"]),
    writable: z.literal(false).optional(),
    unavailableReason: z.string().optional(),
    fields: z
      .array(
        z.strictObject({
          path: z.array(z.union([z.string(), z.number()])).readonly(),
          sourceIds: z.array(z.string()).readonly(),
          sensitive: z.boolean(),
        })
      )
      .readonly(),
    sources: z
      .array(z.strictObject({ id: z.string(), kind: z.string() }))
      .readonly(),
  }),
});

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

export const compiledWorkspaceSchema = z.strictObject({
  workspace_id: z.string(),
  title: z.string(),
  revision: z.string(),
  module: z.string(),
  styles: z.array(z.string()),
  navigation: consolePageDescriptorSchema.shape.navigation,
  requirements: z.array(z.unknown()).length(0),
  assets: z.array(
    z.strictObject({
      path: z.string(),
      media_type: z.string(),
      content_base64: z.string(),
    })
  ),
  workspaces: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      path: z.string().optional(),
      index: z.array(z.string()).optional(),
      access: z.enum(["member", "administrator"]),
      routes: z.array(z.array(z.string())),
      navigation: consolePageDescriptorSchema.shape.navigation,
    })
  ),
});

export const consoleSessionSchema = z.strictObject({
  mode: z.literal("required"),
  authenticated: z.literal(true),
  subject: z.string(),
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

export const consoleAppsCatalogSchema = z.strictObject({
  apps: z
    .array(
      consoleTargetDescriptorSchema.extend({
        scope: z.literal("application"),
        pluginConfiguration: z.literal(true),
        agentId: z.null(),
        localBundleInstall: z.literal(false),
      })
    )
    .readonly(),
});
export type ConsoleAppsCatalog = z.infer<typeof consoleAppsCatalogSchema>;

export const consolePageCatalogSchema = z.strictObject({
  schema: z.literal("console.page-catalog/1"),
  mounts: z.array(consolePageDescriptorSchema).readonly(),
});
export type ConsolePageCatalog = z.infer<typeof consolePageCatalogSchema>;

export const consoleContract = {
  catalog: oc.input(z.strictObject({ targetId: z.string().optional() })).output(
    z.strictObject({
      schemaVersion: z.literal(1),
      revision: z.string(),
      operations: z.array(consoleOperationDescriptorSchema),
    })
  ),
  invoke: oc
    .input(
      z.union([
        z.strictObject({
          targetId: z.string(),
          key: z.string(),
          input: z.unknown(),
        }),
        z.strictObject({
          targetId: z.string(),
          pluginId: z.string(),
          method: z.string(),
          input: z.unknown(),
        }),
      ])
    )
    .output(type<unknown>()),
  plugins: oc.input(z.strictObject({ targetId: z.string() })).output(
    z.strictObject({
      schemaVersion: z.literal(1),
      plugins: z.array(consolePluginDescriptorSchema),
    })
  ),
  targets: oc.output(
    z.strictObject({
      schemaVersion: z.literal(1),
      targets: z.array(consoleTargetDescriptorSchema),
    })
  ),
  workspace: {
    invoke: oc
      .errors({
        WORKSPACE_SERVICE_ERROR: {
          data: z.strictObject({
            code: z.string(),
            status: z.number().int().min(400).max(599),
          }),
        },
        WORKSPACE_SERVICE_DOMAIN_ERROR: {
          data: z.strictObject({ payload: z.unknown() }),
        },
      })
      .input(
        z.strictObject({
          mountId: z.string(),
          service: z.string(),
          operation: z.string(),
          input: z.unknown(),
        })
      )
      .output(type<unknown>()),
    subscribe: oc
      .input(
        z.strictObject({
          mountId: z.string(),
          service: z.string(),
          operation: z.string(),
          input: z.unknown(),
        })
      )
      .output(asyncIteratorObject(z.unknown(), z.void())),
  },
};

export type ConsoleClient = RouterContractClient<typeof consoleContract>;
