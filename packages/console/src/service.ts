import { AuthError } from "@lenso/auth";
import {
  consoleContract,
  consolePageDescriptorSchema,
  consolePluginDescriptorSchema,
  consoleTargetDescriptorSchema,
  type ConsoleOperationDescriptor,
} from "@lenso/console-sdk/protocol";
import {
  EngineError,
  environmentSecrets,
  redact,
} from "@lenso/engine/diagnostics";
import {
  boundedJson,
  validateOperations,
  type Operation,
} from "@lenso/engine/operations";
import { createManageAdapter, defineManage } from "@lenso/manage";
import { COMMON_ERROR_STATUS_MAP, implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { ConsoleRequestError } from "./auth";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleMount,
  ConsoleOptions,
  ConsoleResource,
  ConsoleRuntime,
  ConsoleService,
  ConsoleTarget,
} from "./types";

const boundaryErrors = new WeakSet<Error>();

class BoundaryError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super("Console request failed");
    this.name = "BoundaryError";
    this.code = code;
    this.status = status;
  }
}

function failure(code: string, status: number): BoundaryError {
  const error = new BoundaryError(code, status);
  boundaryErrors.add(error);
  return error;
}

function safeError(error: unknown): BoundaryError {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    const cause = current;
    seen.add(cause);
    current = cause.cause;
    if (cause instanceof ConsoleRequestError) {
      const code = {
        bad_request: "BAD_REQUEST",
        unauthorized: "UNAUTHORIZED",
        forbidden: "FORBIDDEN",
        session_changed: "PRECONDITION_FAILED",
        service_unavailable: "SERVICE_UNAVAILABLE",
      }[cause.code];
      return failure(code, cause.status);
    }
    if (cause instanceof AuthError) {
      const status = {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        REAUTHENTICATION_REQUIRED: 401,
        SERVICE_UNAVAILABLE: 503,
      }[cause.code];
      return failure(
        cause.code === "REAUTHENTICATION_REQUIRED"
          ? "UNAUTHORIZED"
          : cause.code,
        status
      );
    }
    if (cause instanceof BoundaryError && boundaryErrors.has(cause)) {
      return cause;
    }
  }
  if (error instanceof EngineError) {
    const { code } = error.diagnostic;
    if (code === "invalid-input") {
      return failure("UNPROCESSABLE_CONTENT", 422);
    }
    if (code === "unknown-operation" || code === "unknown-plugin") {
      return failure("NOT_FOUND", 404);
    }
    if (
      [
        "forbidden-operation",
        "confirmation-required",
        "approval-required",
      ].includes(code)
    ) {
      return failure("FORBIDDEN", 403);
    }
  }
  if (error instanceof ORPCError && error.code === "BAD_REQUEST") {
    return failure("UNPROCESSABLE_CONTENT", 422);
  }
  return failure("SERVICE_UNAVAILABLE", 503);
}

function basePath(value: string): "" | `/${string}` {
  if (
    !/^\/(?:[a-zA-Z0-9._~-]+\/)*[a-zA-Z0-9._~-]*$/.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("Console base paths must be absolute safe paths.");
  }
  return value === "/" ? "" : `/${value.slice(1).replace(/\/$/, "")}`;
}

function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function relativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !/[\\?#%]/u.test(value) &&
    !hasControlCharacter(value) &&
    value
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

function jsonInput(value: unknown): void {
  try {
    boundedJson(value);
  } catch (error) {
    const oversized =
      error instanceof EngineError &&
      error.diagnostic.code === "output-too-large";
    throw failure(
      oversized ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
      oversized ? 413 : 400
    );
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || code === 0x7f;
  });
}

function checkAbort(request: Request): void {
  request.signal.throwIfAborted();
}

async function boundedRpcRequest(request: Request): Promise<Request> {
  if (!request.body) {
    return request;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > 1024 * 1024 + 4096) {
        await reader.cancel();
        throw failure("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body, method: request.method });
}

function resource(
  target: ConsoleTarget,
  action: ConsoleResource["action"],
  operation?: Operation,
  mount?: ConsoleMount
): ConsoleResource {
  return {
    action,
    targetId: target.id,
    tenantId: target.tenantId,
    ...(mount
      ? {
          mountId: mount.descriptor.id,
          pluginId: mount.descriptor.owner.instance,
        }
      : {}),
    ...(operation
      ? { pluginId: operation.plugin.id, operation: operation.method }
      : {}),
  };
}

export function createConsoleService(
  runtime: ConsoleRuntime,
  auth: ConsoleAuthentication,
  options: ConsoleOptions
): ConsoleService {
  const api = basePath(options.apiBasePath ?? "/api");
  const shell = basePath(options.shellBasePath ?? "/");
  const authBase = basePath(options.authBasePath ?? "/auth");
  if (
    !api ||
    !authBase ||
    overlaps(api, authBase) ||
    (shell &&
      (shell === api ||
        shell.startsWith(`${api}/`) ||
        shell === authBase ||
        shell.startsWith(`${authBase}/`)))
  ) {
    throw new Error(
      "Console Auth and API paths must be separate; shell cannot occupy either subtree."
    );
  }
  if (
    (options.shell !== undefined || options.shellMatches !== undefined) &&
    (typeof options.shell !== "function" ||
      typeof options.shellMatches !== "function")
  ) {
    throw new Error(
      "Console shell requires an explicit route matcher and response callback."
    );
  }
  const targets = [...options.targets];
  const targetIds = new Set<string>();
  const mounts = new Map<
    string,
    { target: ConsoleTarget; mount: ConsoleMount }
  >();
  const selected = new Map<ConsoleTarget, readonly Operation[]>();
  const mountRoutes: { subject: string; base: string }[] = [];
  for (const target of targets) {
    if (
      !/^[a-z][a-z0-9._-]{0,63}$/.test(target.id) ||
      redact(target.id, environmentSecrets()) !== target.id ||
      !target.label.trim() ||
      !target.tenantId ||
      targetIds.has(target.id)
    ) {
      throw new Error(
        "Console targets need unique IDs and server-bound tenants."
      );
    }
    targetIds.add(target.id);
    const running = target.running ?? runtime;
    for (const plugin of target.plugins) {
      running.get(plugin);
    }
    const operations = target.manage.flatMap((manage) => {
      defineManage(manage);
      if (!target.plugins.includes(manage.plugin)) {
        throw new Error(
          "Manage must bind an explicitly selected exact plugin."
        );
      }
      return [...manage.operations];
    });
    validateOperations(target.plugins, operations);
    selected.set(target, operations);
    // Constructing the adapter proves each declaration belongs to this exact runtime.
    createManageAdapter({
      running,
      plugins: target.plugins,
      operations,
      binding: () => ({}),
      canList: () => false,
    });
    for (const mount of target.mounts ?? []) {
      const descriptor = consolePageDescriptorSchema.parse(
        JSON.parse(
          boundedJson(
            redact(
              {
                ...mount.descriptor,
                protocol: "lenso-console-rpc/2",
              },
              environmentSecrets()
            )
          )
        )
      );
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9._~-]*$/.test(descriptor.id) ||
        mounts.has(descriptor.id) ||
        descriptor.owner.source !== "application" ||
        descriptor.owner.trusted !== true ||
        !target.plugins.some(
          (plugin) => plugin.id === mount.descriptor.owner.instance
        ) ||
        !/^[a-f0-9]{64}$/.test(descriptor.implementationId) ||
        !descriptor.revision ||
        (descriptor.subject.kind === "app" &&
          descriptor.subject.appId !== target.id)
      ) {
        throw new Error(
          "Console mount must name an installed owner, target and immutable implementation."
        );
      }
      const assetBase = `${api}/console/v1/pages/${descriptor.id}/assets/${descriptor.implementationId}/`;
      for (const asset of [descriptor.module, ...descriptor.styles]) {
        if (
          !asset.startsWith(assetBase) ||
          !relativePath(asset.slice(assetBase.length))
        ) {
          throw new Error(
            "Console assets must be bound to their mount implementation."
          );
        }
      }
      for (const service of Object.values(mount.services)) {
        if (
          !target.manage.includes(service.manage) ||
          service.operations.some(
            (operation) => !service.manage.operations.includes(operation)
          )
        ) {
          throw new Error(
            "Workspace services must select installed Manage declarations."
          );
        }
        validateOperations([service.manage.plugin], service.operations);
      }
      for (const requirement of descriptor.requirements) {
        const service = mount.services[requirement.service_id];
        if (
          requirement.required &&
          (!requirement.available ||
            !service ||
            requirement.operations.some(
              (method) => !service.operations.some((op) => op.method === method)
            ))
        ) {
          throw new Error(
            "Required workspace services must be explicitly admitted."
          );
        }
      }
      const subject =
        descriptor.subject.kind === "console" ? "console" : target.id;
      const routeBase = basePath(descriptor.basePath ?? "/");
      if (
        mountRoutes.some(
          (route) =>
            route.subject === subject && overlaps(route.base, routeBase)
        )
      ) {
        throw new Error("Console workspace route ownership overlaps.");
      }
      mountRoutes.push({ subject, base: routeBase });
      mounts.set(descriptor.id, { target, mount: { ...mount, descriptor } });
    }
  }

  const catalogRevision = crypto.randomUUID();
  const writable = (
    operation: Operation,
    target: ConsoleTarget,
    mount?: ConsoleMount
  ) =>
    operation.effect === "read" ||
    options.canWrite?.(
      operation,
      resource(target, "invoke", operation, mount)
    ) === true;
  const findTarget = (id: string) => {
    const target = targets.find((item) => item.id === id);
    if (!target) {
      throw failure("NOT_FOUND", 404);
    }
    return target;
  };
  const adapter = (
    target: ConsoleTarget,
    request: Request,
    identity: ConsoleIdentity,
    operations = selected.get(target)!,
    mount?: ConsoleMount
  ) =>
    createManageAdapter({
      running: target.running ?? runtime,
      plugins: target.plugins,
      operations,
      canList: (operation) =>
        auth.can(identity, resource(target, "list", operation, mount)),
      binding: async (operation, input) => {
        checkAbort(request);
        if (mount?.descriptor.access === "administrator") {
          await auth.enforce(
            identity,
            resource(target, "admin", undefined, mount)
          );
        }
        const boundResource = resource(target, "invoke", operation, mount);
        await auth.enforce(identity, boundResource);
        if (!writable(operation, target, mount)) {
          throw failure("FORBIDDEN", 403);
        }
        const binding = await options.binding(
          operation,
          input,
          request,
          identity,
          boundResource
        );
        checkAbort(request);
        return {
          ...binding,
          signal: binding.signal
            ? AbortSignal.any([request.signal, binding.signal])
            : request.signal,
        };
      },
    });
  async function invoke(
    target: ConsoleTarget,
    pluginId: string,
    method: string,
    input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    operations = selected.get(target)!,
    mount?: ConsoleMount
  ) {
    checkAbort(request);
    jsonInput(input);
    const result = await adapter(
      target,
      request,
      identity,
      operations,
      mount
    ).invoke(pluginId, method, input);
    checkAbort(request);
    return result;
  }
  function workspace(id: string, request: Request) {
    const entry = mounts.get(id);
    if (!entry) {
      throw failure("NOT_FOUND", 404);
    }
    const { descriptor } = entry.mount;
    for (const [header, expected] of [
      ["x-lenso-page-owner", descriptor.owner.instance],
      ["x-lenso-page-revision", descriptor.revision],
      ["x-lenso-page-implementation", descriptor.implementationId],
    ] as const) {
      if (request.headers.get(header) !== expected) {
        throw failure("CONFLICT", 409);
      }
    }
    return entry;
  }
  const implementation = implement(consoleContract).$context<{
    request: Request;
    identity: ConsoleIdentity;
  }>();
  const router = implementation.router({
    targets: implementation.targets.handler(
      async ({ context: { identity } }) => {
        const visibleTargets = await Promise.all(
          targets.map(async (target) =>
            (await auth.can(identity, resource(target, "list")))
              ? consoleTargetDescriptorSchema.parse(
                  redact(
                    { id: target.id, label: target.label },
                    environmentSecrets()
                  )
                )
              : undefined
          )
        );
        return {
          schemaVersion: 1,
          targets: visibleTargets.filter((target) => target !== undefined),
        };
      }
    ),
    catalog: implementation.catalog.handler(
      async ({ input, context: { request, identity } }) => {
        const operations: ConsoleOperationDescriptor[] = [];
        for (const target of input.targetId
          ? [findTarget(input.targetId)]
          : targets) {
          if (!(await auth.can(identity, resource(target, "list")))) {
            continue;
          }
          for (const entry of await adapter(
            target,
            request,
            identity
          ).catalog()) {
            const index = /^operation_(0|[1-9][0-9]*)$/.exec(entry.key);
            const operation = index
              ? selected.get(target)![Number(index[1])]
              : undefined;
            if (!operation) {
              throw failure("SERVICE_UNAVAILABLE", 503);
            }
            const available = writable(operation, target);
            operations.push({
              key: `${catalogRevision}:${target.id}:${entry.key}`,
              targetId: target.id,
              pluginId: entry.pluginId,
              method: entry.method,
              description: entry.description,
              effect: entry.effect,
              schemaAvailability:
                entry.schemaAvailability === "available"
                  ? "available"
                  : "runtime-validation-only",
              ...(entry.inputSchema ? { inputSchema: entry.inputSchema } : {}),
              confirmation: entry.confirmation === "required",
              approval: entry.approval === "required",
              available,
              ...(available
                ? {}
                : {
                    unavailableReason: "Write guarantees are not configured.",
                  }),
            });
          }
        }
        return { schemaVersion: 1, revision: catalogRevision, operations };
      }
    ),
    plugins: implementation.plugins.handler(
      async ({ input, context: { identity } }) => {
        const target = findTarget(input.targetId);
        await auth.enforce(identity, resource(target, "list"));
        const running = target.running ?? runtime;
        const plugins = [];
        for (const plugin of target.plugins) {
          if (
            !(await auth.can(identity, {
              ...resource(target, "list"),
              pluginId: plugin.id,
            }))
          ) {
            continue;
          }
          plugins.push(
            consolePluginDescriptorSchema.parse(
              redact(
                {
                  id: plugin.id,
                  targetId: target.id,
                  configuration: running.configuration?.(plugin) ?? {
                    state: "unavailable" as const,
                    fields: [],
                    sources: [],
                  },
                },
                environmentSecrets()
              )
            )
          );
        }
        return { schemaVersion: 1, plugins };
      }
    ),
    invoke: implementation.invoke.handler(
      async ({ input, context: { request, identity } }) => {
        const target = findTarget(input.targetId);
        if ("key" in input) {
          const keyPrefix = `${catalogRevision}:${target.id}:`;
          if (!input.key.startsWith(keyPrefix)) {
            throw failure("CONFLICT", 409);
          }
          checkAbort(request);
          jsonInput(input.input);
          const result = await adapter(target, request, identity).invokeEntry(
            input.key.slice(keyPrefix.length),
            input.input
          );
          checkAbort(request);
          return result;
        }
        return invoke(
          target,
          input.pluginId,
          input.method,
          input.input,
          request,
          identity
        );
      }
    ),
    workspace: {
      invoke: implementation.workspace.invoke.handler(
        async ({ input, context: { request, identity } }) => {
          try {
            const { target, mount } = workspace(input.mountId, request);
            const requirement = mount.descriptor.requirements.find(
              (entry) => entry.service_id === input.service
            );
            if (
              !requirement?.available ||
              !requirement.operations.includes(input.operation)
            ) {
              throw failure("NOT_FOUND", 404);
            }
            const service = Object.hasOwn(mount.services, input.service)
              ? mount.services[input.service]
              : undefined;
            if (!service) {
              throw failure("NOT_FOUND", 404);
            }
            return await invoke(
              target,
              service.manage.plugin.id,
              input.operation,
              input.input,
              request,
              identity,
              service.operations,
              mount
            );
          } catch (error) {
            request.signal.throwIfAborted();
            const safe = safeError(error);
            throw new ORPCError(safe.code);
          }
        }
      ),
    },
  });
  const rpc = new RPCHandler(router, {
    errorStatusMap: COMMON_ERROR_STATUS_MAP,
    clientInterceptors: [
      async ({ next }) => {
        try {
          return await next();
        } catch (error) {
          if (error instanceof ORPCError) {
            throw error;
          }
          throw new ORPCError(safeError(error).code);
        }
      },
    ],
  });
  const prefix: `/${string}` = `${api}/console`;
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const authRoute = path === authBase || path.startsWith(`${authBase}/`);
      const consoleRoute = path.startsWith(`${prefix}/`);
      if (
        !(
          authRoute ||
          consoleRoute ||
          (options.shell &&
            (!shell || path === shell || path.startsWith(`${shell}/`)))
        )
      ) {
        return undefined;
      }
      try {
        if (!authRoute && !consoleRoute && !options.shellMatches!(request)) {
          return undefined;
        }
        auth.admit(request);
        checkAbort(request);
        if (authRoute) {
          const response = await auth.fetch(request);
          checkAbort(request);
          return response;
        }
        if (!consoleRoute) {
          const response = await options.shell?.(request);
          checkAbort(request);
          return response;
        }
        const identity = await auth.authenticate(request);
        checkAbort(request);
        let response: Response | undefined;
        if (request.method === "GET" && path === `${prefix}/v1/session`) {
          const session = await auth.session(identity);
          response = Response.json({
            mode: "required",
            authenticated: true,
            subject: identity.actor.subjectId,
            ...session,
            assistant_enabled: false,
            human_management_enabled: false,
            management_enabled: options.management === true,
          });
        } else if (request.method === "GET" && path === `${prefix}/v1/apps`) {
          const permitted = [];
          for (const target of targets) {
            if (await auth.can(identity, resource(target, "list"))) {
              permitted.push({
                ...consoleTargetDescriptorSchema.parse(
                  redact(
                    { id: target.id, label: target.label },
                    environmentSecrets()
                  )
                ),
                scope: "application",
                pluginConfiguration: false,
                agentId: null,
                localBundleInstall: false,
              });
            }
          }
          response = Response.json({ apps: permitted });
        } else if (
          request.method === "GET" &&
          path === `${prefix}/v1/surfaces`
        ) {
          response = Response.json({
            schema: "console.page-catalog/1",
            mounts: [],
          });
        } else if (request.method === "GET" && path === `${prefix}/v1/pages`) {
          const visible = [];
          for (const { target, mount } of mounts.values()) {
            if (
              await auth.can(
                identity,
                resource(
                  target,
                  mount.descriptor.access === "administrator"
                    ? "admin"
                    : "list",
                  undefined,
                  mount
                )
              )
            ) {
              visible.push({
                ...mount.descriptor,
                requirements: mount.descriptor.requirements.map(
                  (requirement) => ({
                    ...requirement,
                    available:
                      requirement.available && options.management === true,
                  })
                ),
              });
            }
          }
          response = Response.json({
            schema: "console.page-catalog/1",
            mounts: visible,
          });
        } else if (
          options.management === true &&
          path.startsWith(`${prefix}/v2/rpc/`)
        ) {
          if (!mounts.size && path.startsWith(`${prefix}/v2/rpc/workspace/`)) {
            throw failure("NOT_FOUND", 404);
          }
          const result = await rpc.handle(await boundedRpcRequest(request), {
            prefix: `${prefix}/v2/rpc`,
            context: { request, identity },
          });
          response = result.matched ? result.response : undefined;
        } else {
          const asset = path.slice(`${prefix}/v1/pages/`.length).split("/");
          if (
            request.method === "GET" &&
            path.startsWith(`${prefix}/v1/pages/`) &&
            asset[1] === "assets"
          ) {
            const entry = mounts.get(asset[0]!);
            if (
              !entry ||
              asset[2] !== entry.mount.descriptor.implementationId
            ) {
              throw failure("NOT_FOUND", 404);
            }
            const relative = asset.slice(3).join("/");
            if (!relativePath(relative)) {
              throw failure("NOT_FOUND", 404);
            }
            await auth.enforce(
              identity,
              resource(
                entry.target,
                entry.mount.descriptor.access === "administrator"
                  ? "admin"
                  : "list",
                undefined,
                entry.mount
              )
            );
            response = await entry.mount.asset(relative);
          }
        }
        checkAbort(request);
        response ??= Response.json(
          path.startsWith(`${prefix}/v2/rpc/`)
            ? { json: new ORPCError("NOT_FOUND").toJSON() }
            : { code: "NOT_FOUND" },
          { status: 404 }
        );
        const projected = new Response(response.body, response);
        projected.headers.set("x-lenso-read-scope", identity.readScope);
        projected.headers.set("cache-control", "no-store");
        return projected;
      } catch (error) {
        request.signal.throwIfAborted();
        const safe = safeError(error);
        const errorBody = new ORPCError(safe.code).toJSON();
        return Response.json(
          path.startsWith(`${prefix}/v2/rpc/`)
            ? { json: errorBody }
            : errorBody,
          {
            status: safe.status,
            headers: { "cache-control": "no-store" },
          }
        );
      }
    },
  };
}
