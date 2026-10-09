import { definePlugin, type Plugin } from "@lenso/core";
import {
  defineOperation,
  boundedJson,
  type Operation as EngineOperation,
} from "@lenso/engine/operations";
import { defineManage, type Manage } from "@lenso/manage";
import { z } from "zod";

import type { Subject } from "./index";
import {
  compiledWorkspaceSchema,
  type ConsolePageAuthoringDescriptor,
} from "./protocol";

/** Supplied by the trusted Host binding, never reconstructed from business input. */
export interface WorkspaceOperationContext {
  subject: Subject;
  owner: { instance: string };
  mountId: string;
  revision: string;
  signal: AbortSignal;
}

export class WorkspaceServiceError extends Error {
  readonly code:
    | "denied"
    | "codec_mismatch"
    | "unknown_operation"
    | "unknown_service"
    | "request_too_large"
    | "response_too_large";

  constructor(code: WorkspaceServiceError["code"]) {
    super(code);
    this.code = code;
    this.name = "WorkspaceServiceError";
  }
}

export interface Operation<Input = unknown, Output = unknown> {
  description?: string;
  effect?: "read" | "write" | "unknown";
  parse(value: unknown): Input;
  authorize(
    context: WorkspaceOperationContext,
    input: Input
  ): boolean | Promise<boolean>;
  handle(
    input: Input,
    context: WorkspaceOperationContext
  ): Output | Promise<Output>;
}
export interface DeclaredOperation<Input = unknown, Output = unknown> {
  readonly interaction: "request";
  readonly description?: string;
  readonly effect?: "read" | "write" | "unknown";
  readonly __types?: { input: Input; output: Output };
  invoke(context: WorkspaceOperationContext, value: unknown): Promise<Output>;
}
export interface DeclaredStreamOperation<Input = unknown, Item = unknown> {
  readonly interaction: "stream";
  readonly description?: string;
  readonly effect: "read";
  readonly __types?: { input: Input; output: Item };
  subscribe(
    context: WorkspaceOperationContext,
    value: unknown
  ): AsyncIterable<Item>;
}

async function admit<Input>(
  declaration: Pick<Operation<Input>, "parse" | "authorize">,
  context: WorkspaceOperationContext,
  value: unknown
): Promise<Input> {
  context.signal.throwIfAborted();
  checkJson(value, "request_too_large");
  let input: Input;
  try {
    input = declaration.parse(value);
  } catch {
    throw new WorkspaceServiceError("codec_mismatch");
  }
  if ((await declaration.authorize(context, input)) !== true) {
    throw new WorkspaceServiceError("denied");
  }
  context.signal.throwIfAborted();
  return input;
}

function checkJson(
  value: unknown,
  sizeError: "request_too_large" | "response_too_large"
): void {
  let json: string;
  try {
    json = boundedJson(value, Number.MAX_SAFE_INTEGER);
  } catch {
    throw new WorkspaceServiceError("codec_mismatch");
  }
  if (new TextEncoder().encode(json).length > 1024 * 1024) {
    throw new WorkspaceServiceError(sizeError);
  }
}

/** Parse and final domain authorization precede every business invocation. */
export function operation<Input, Output>(
  declaration: Operation<Input, Output>
): DeclaredOperation<Input, Awaited<Output>> {
  return {
    interaction: "request",
    description: declaration.description,
    effect: declaration.effect,
    async invoke(context, value): Promise<Awaited<Output>> {
      const input = await admit(declaration, context, value);
      const output = await declaration.handle(input, context);
      context.signal.throwIfAborted();
      checkJson(output, "response_too_large");
      return output;
    },
  };
}

export function streamOperation<Input, Item>(
  declaration: Omit<Operation<Input, AsyncIterable<Item>>, "effect"> & {
    effect?: "read";
  }
): DeclaredStreamOperation<Input, Item> {
  if (declaration.effect !== undefined && declaration.effect !== "read") {
    throw new Error("Workspace streams must have read-only effects");
  }
  return {
    interaction: "stream",
    description: declaration.description,
    effect: "read",
    async *subscribe(context, value) {
      const input = await admit(declaration, context, value);
      const stream = await declaration.handle(input, context);
      for await (const item of stream) {
        context.signal.throwIfAborted();
        checkJson(item, "response_too_large");
        yield item;
      }
    },
  };
}

export interface Service {
  capabilityId: string;
  version: string;
  operations: Readonly<
    Record<string, DeclaredOperation | DeclaredStreamOperation>
  >;
}
export type ServiceDefinitions = Readonly<Record<string, Service>>;

export function defineServices<const Definitions extends ServiceDefinitions>(
  services: Definitions
): Definitions {
  if (Object.keys(services).length > 32) {
    throw new Error("Too many workspace services");
  }
  for (const [id, service] of Object.entries(services)) {
    if (id === "then" || Object.hasOwn(service.operations, "then")) {
      throw new Error(
        `Workspace service "${id}" cannot use reserved client member "then"`
      );
    }
    if (
      !/^[a-z][a-z0-9._-]{0,63}$/.test(id) ||
      !service.capabilityId.trim() ||
      service.capabilityId.length > 128 ||
      !service.version.trim() ||
      service.version.length > 32 ||
      Object.keys(service.operations).length === 0 ||
      Object.keys(service.operations).length > 32
    ) {
      throw new Error(
        `Workspace service "${id}" requires a valid alias, contract/version and 1..32 operations`
      );
    }
    for (const name of Object.keys(service.operations)) {
      if (!/^[a-z][a-z0-9._-]{0,63}$/.test(name)) {
        throw new Error(
          `Workspace service "${id}" has an invalid operation "${name}"`
        );
      }
    }
  }
  return services;
}

/** Plain dispatch only. Installation, mount admission and lifetime belong to the Host. */
export function createWorkspaceServices(
  services: ServiceDefinitions,
  revision: string
) {
  const requirements = Object.entries(services).map(
    ([service_id, service]) => ({
      service_id,
      capability_id: service.capabilityId,
      descriptor_version: service.version,
      operations: Object.keys(service.operations),
      streaming_operations: Object.entries(service.operations)
        .filter(([, declaration]) => declaration.interaction === "stream")
        .map(([name]) => name),
      required: true,
      source: "owner" as const,
    })
  );
  const resolve = (
    context: WorkspaceOperationContext,
    service: string,
    name: string
  ) => {
    context.signal.throwIfAborted();
    if (context.revision !== revision) {
      throw new WorkspaceServiceError("denied");
    }
    if (!Object.hasOwn(services, service)) {
      throw new WorkspaceServiceError("unknown_service");
    }
    const { operations } = services[service];
    if (!Object.hasOwn(operations, name)) {
      throw new WorkspaceServiceError("unknown_operation");
    }
    return operations[name];
  };
  return {
    requirements,
    invoke(
      context: WorkspaceOperationContext,
      request: { service: string; operation: string; input: unknown }
    ) {
      const declaration = resolve(context, request.service, request.operation);
      if (declaration.interaction !== "request") {
        throw new WorkspaceServiceError("unknown_operation");
      }
      return declaration.invoke(context, request.input);
    },
    subscribe(
      context: WorkspaceOperationContext,
      request: { service: string; operation: string; input: unknown }
    ) {
      const declaration = resolve(context, request.service, request.operation);
      if (declaration.interaction !== "stream") {
        throw new WorkspaceServiceError("unknown_operation");
      }
      return declaration.subscribe(context, request.input);
    },
  };
}

export interface WorkspaceMountService {
  readonly manage: Manage;
  readonly operations: readonly EngineOperation[];
  readonly operationAliases: Readonly<Record<string, string>>;
  readonly streams: readonly {
    operation: EngineOperation;
    output: EngineOperation["input"];
  }[];
}

export interface WorkspaceMount {
  readonly descriptor: ConsolePageAuthoringDescriptor;
  readonly placement?: "page" | "global";
  readonly services: Readonly<Record<string, WorkspaceMountService>>;
  readonly asset: (relativePath: string) => Promise<Response | undefined>;
}

/** Only the declared workspace operations become explicit owner-bound Manage operations. */
export function createWorkspacePlugin(options: {
  id: string;
  services: ServiceDefinitions;
  revision: string;
}): {
  plugin: Plugin<
    Record<
      string,
      (input: unknown, context: WorkspaceOperationContext) => unknown
    >
  >;
  manage: Manage;
  services: Readonly<Record<string, WorkspaceMountService>>;
  requirements: ReturnType<typeof createWorkspaceServices>["requirements"];
} {
  const adapter = createWorkspaceServices(
    defineServices(options.services),
    options.revision
  );
  const methods: Record<
    string,
    (input: unknown, context: WorkspaceOperationContext) => unknown
  > = Object.create(null);
  for (const [alias, service] of Object.entries(options.services)) {
    for (const [name, declaration] of Object.entries(service.operations)) {
      methods[`${alias}:${name}`] = (input, context) => {
        if (context.owner.instance !== options.id) {
          throw new WorkspaceServiceError("denied");
        }
        const request = { service: alias, operation: name, input };
        return declaration.interaction === "request"
          ? adapter.invoke(context, request)
          : adapter.subscribe(context, request);
      };
    }
  }
  const plugin = definePlugin({ id: options.id, setup: () => methods });
  const declarations = Object.entries(options.services).flatMap(
    ([alias, service]) =>
      Object.entries(service.operations).map(([name, declaration]) => ({
        alias,
        interaction: declaration.interaction,
        operation: defineOperation({
          plugin,
          method: `${alias}:${name}`,
          input: z.unknown(),
          context: true,
          description: declaration.description ?? `${alias}:${name}`,
          effect: declaration.effect ?? "unknown",
          cancellation: "cooperative",
        }),
      }))
  );
  const manage = defineManage({
    plugin,
    operations: declarations
      .filter((entry) => entry.interaction === "request")
      .map((entry) => entry.operation),
  });
  const services = Object.fromEntries(
    Object.entries(options.services).map(([alias, service]) => {
      const selected = declarations.filter((entry) => entry.alias === alias);
      return [
        alias,
        {
          manage,
          operations: selected
            .filter((entry) => entry.interaction === "request")
            .map((entry) => entry.operation),
          operationAliases: Object.fromEntries(
            Object.keys(service.operations).map((name) => [
              name,
              `${alias}:${name}`,
            ])
          ),
          streams: selected
            .filter((entry) => entry.interaction === "stream")
            .map((entry) => ({
              operation: entry.operation,
              output: z.unknown(),
            })),
        },
      ];
    })
  );
  return { plugin, manage, services, requirements: adapter.requirements };
}

export interface WorkspaceMountOptions {
  id: string;
  workspaceId?: string;
  subject: Subject;
  basePath?: string;
  apiBasePath?: string;
  targetId?: string;
  placement?: "page" | "global";
}

/** Compiled content is executable only after the application installs this exact owner. */
export function createWorkspaceInstallation(options: {
  id: string;
  descriptor: unknown;
  services?: ServiceDefinitions;
  aliases?: Readonly<Record<string, readonly string[] | null>>;
}) {
  const descriptor = compiledWorkspaceSchema.parse(options.descriptor);
  const installation = createWorkspacePlugin({
    id: options.id,
    services: options.services ?? {},
    revision: descriptor.revision,
  });
  return {
    plugin: installation.plugin,
    manage: installation.manage,
    createMount(mount: WorkspaceMountOptions): WorkspaceMount {
      const workspace = descriptor.workspaces.find(
        (entry) => entry.id === (mount.workspaceId ?? descriptor.workspace_id)
      );
      if (!workspace) {
        throw new Error("Unknown compiled workspace");
      }
      const aliases =
        options.aliases?.[workspace.id] ?? Object.keys(installation.services);
      if (
        aliases.some((alias) => !Object.hasOwn(installation.services, alias))
      ) {
        throw new Error("Workspace declares an unknown service alias");
      }
      const api = (mount.apiBasePath ?? "/api").replace(/\/$/, "");
      const assetBase = `${api}/console/v1/pages/${mount.id}/assets/${descriptor.revision}/`;
      return {
        descriptor: {
          apiMajor: 1,
          protocol: "lenso-console-rpc/2",
          targetId: mount.targetId,
          id: mount.id,
          title: workspace.title,
          subject: mount.subject,
          owner: { instance: options.id, source: "application", trusted: true },
          revision: descriptor.revision,
          implementationId: descriptor.revision,
          pageId: workspace.id,
          basePath: mount.basePath ?? workspace.path,
          module: `${assetBase}${descriptor.module}`,
          styles: descriptor.styles.map((style) => `${assetBase}${style}`),
          navigation: workspace.navigation,
          access: workspace.access,
          index: workspace.index,
          routes: workspace.routes,
          requirements: installation.requirements
            .filter((entry) => aliases.includes(entry.service_id))
            .map((entry) => ({ ...entry, available: true })),
        },
        placement: mount.placement,
        services: Object.fromEntries(
          aliases.map((alias) => [alias, installation.services[alias]])
        ),
        async asset(relativePath) {
          const asset = descriptor.assets.find(
            (entry) => entry.path === relativePath
          );
          if (!asset) {
            return undefined;
          }
          const content = Uint8Array.from(
            atob(asset.content_base64),
            (character) => character.codePointAt(0) ?? 0
          );
          return new Response(content, {
            headers: { "content-type": asset.media_type },
          });
        },
      };
    },
  };
}
