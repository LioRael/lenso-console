import { oc, type, type RouterContractClient } from "@orpc/contract";
import { z } from "zod";

export interface ConsoleOperationDescriptor {
  key: string;
  targetId: string;
  pluginId: string;
  method: string;
  description: string;
  effect: "read" | "write" | "unknown";
  schemaAvailability: "available" | "runtime-validation-only";
  inputSchema?: Record<string, unknown>;
  confirmation: boolean;
  approval: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface ConsolePluginDescriptor {
  id: string;
  targetId: string;
  configuration: {
    state: "unconfigured" | "resolved" | "unavailable";
    fields: readonly {
      path: readonly (string | number)[];
      sourceIds: readonly string[];
      sensitive: boolean;
    }[];
    sources: readonly { id: string; kind: string }[];
  };
}

export interface ConsoleTargetDescriptor {
  id: string;
  label: string;
}

export const consoleTargetDescriptorSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
});

export const consolePluginDescriptorSchema = z.strictObject({
  id: z.string(),
  targetId: z.string(),
  configuration: z.strictObject({
    state: z.enum(["unconfigured", "resolved", "unavailable"]),
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
  requirements: z
    .array(
      z.strictObject({
        service_id: z.string(),
        capability_id: z.string(),
        descriptor_version: z.string(),
        operations: z.array(z.string()).readonly(),
        available: z.boolean(),
        required: z.boolean(),
        source: z.enum(["owner", "subject"]),
      })
    )
    .readonly(),
});

export const consoleContract = {
  catalog: oc.input(z.strictObject({ targetId: z.string().optional() })).output(
    type<{
      schemaVersion: 1;
      revision: string;
      operations: ConsoleOperationDescriptor[];
    }>()
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
  plugins: oc
    .input(z.strictObject({ targetId: z.string() }))
    .output(type<{ schemaVersion: 1; plugins: ConsolePluginDescriptor[] }>()),
  targets:
    oc.output(type<{ schemaVersion: 1; targets: ConsoleTargetDescriptor[] }>()),
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
  },
};

export type ConsoleClient = RouterContractClient<typeof consoleContract>;
