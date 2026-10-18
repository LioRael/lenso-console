import {
  asyncIteratorObject,
  oc,
  type,
  type RouterContractClient,
} from "@orpc/contract";
import { z } from "zod";

import { consolePageDescriptorSchema } from "./admission-protocol";

export {
  consolePageDescriptorSchema,
  consoleSessionSchema,
  consolePageCatalogSchema,
  type ConsolePageDescriptor,
  type ConsolePageAuthoringDescriptor,
  type ConsoleSession,
  type ConsolePageCatalog,
} from "./admission-protocol";

export { consoleHttpPathsSchema } from "./http-paths";
export type {
  ConsoleHttpPaths,
  WorkspaceSource,
  WorkspaceNavigationCheck,
} from "./http-paths";

/** Declared schema paths only; never rejected values or validator messages. */
export const consoleInputIssuesSchema = z
  .array(z.array(z.string().min(1).max(128)).min(1).max(8))
  .max(32)
  .readonly();

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
      settings: consolePageDescriptorSchema.shape.settings,
      routes: z.array(z.array(z.string())),
      navigation: consolePageDescriptorSchema.shape.navigation,
    })
  ),
});

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
