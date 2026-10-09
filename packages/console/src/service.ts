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
  executeOperation,
  operationError,
  validateOperationInput,
  validateOperations,
  type Operation,
} from "@lenso/engine/operations";
import {
  createManageAdapter,
  createManageSelection,
  defineManage,
  type ManageSelection,
} from "@lenso/manage";
import { COMMON_ERROR_STATUS_MAP, implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { ConsoleRequestError, expectedConsoleSubject } from "./auth";
import { isConsoleOperationError } from "./errors";
import { createLocaleRoutes } from "./locale";
import { snapshotOperation } from "./operation-selection";
import { readRequestBytes } from "./request-body";
import { subscription } from "./subscription";
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
  readonly retryAfterMs?: number;
  constructor(code: string, status: number, retryAfterMs?: number) {
    super("Console request failed");
    this.name = "BoundaryError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function failure(
  code: string,
  status: number,
  retryAfterMs?: number
): BoundaryError {
  const error = new BoundaryError(code, status, retryAfterMs);
  boundaryErrors.add(error);
  return error;
}

function rpcFailure(
  error: BoundaryError,
  headers: Headers
): ORPCError<string, unknown> {
  if (error.retryAfterMs !== undefined) {
    headers.set("retry-after", String(Math.ceil(error.retryAfterMs / 1000)));
    return new ORPCError(error.code, {
      data: { retryAfterMs: error.retryAfterMs },
    });
  }
  return new ORPCError(error.code);
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
    if (isConsoleOperationError(cause)) {
      return failure(cause.code, cause.status, cause.retryAfterMs);
    }
  }
  if (error instanceof EngineError) {
    const { code } = error.diagnostic;
    if (["invalid-input", "invalid-task", "invalid-options"].includes(code)) {
      return failure("UNPROCESSABLE_CONTENT", 422);
    }
    if (["unknown-operation", "unknown-plugin", "not-found"].includes(code)) {
      return failure("NOT_FOUND", 404);
    }
    if (code === "conflict") {
      return failure("CONFLICT", 409);
    }
    if (code === "unsupported") {
      return failure("NOT_IMPLEMENTED", 501);
    }
    if (
      [
        "forbidden-operation",
        "confirmation-required",
        "approval-required",
        "forbidden",
        "denied",
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
  const body = await readRequestBytes(request, 1024 * 1024 + 4096, () =>
    failure("PAYLOAD_TOO_LARGE", 413)
  );
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
  const lifecycle = new AbortController();
  const subscriptions = new Set<() => Promise<unknown>>();
  const openings = new Set<Promise<unknown>>();
  let closing: Promise<void> | undefined;
  let cleanupFailure: Error | undefined;
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
  const targets = options.targets.map((target) => ({
    ...target,
    plugins: [...target.plugins],
    manage: [...target.manage],
    mounts: [...(target.mounts ?? [])],
  }));
  const locale = createLocaleRoutes(
    options.locale ? runtime.get(options.locale) : undefined,
    auth,
    options.localeResource
  );
  const targetIds = new Set<string>();
  const mounts = new Map<
    string,
    { target: ConsoleTarget; mount: ConsoleMount }
  >();
  const selections = new Map<ConsoleTarget, ManageSelection>();
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
    selections.set(
      target,
      createManageSelection({
        running,
        plugins: target.plugins,
        operations,
      })
    );
    for (const mount of target.mounts ?? []) {
      if (mount.credentials) {
        for (const operation of ["issue", "rotate"] as const) {
          const endpoint = mount.credentials[`${operation}Path`];
          const bound = mount.credentials.resources[operation];
          if (
            !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(endpoint) ||
            bound.targetId !== target.id ||
            bound.tenantId !== target.tenantId ||
            bound.action !== "invoke" ||
            bound.operation !== operation
          ) {
            throw new Error(
              "Credential routes must be explicitly owned by this target."
            );
          }
        }
      }
      const descriptor = consolePageDescriptorSchema.parse(
        JSON.parse(
          boundedJson(
            redact(
              {
                ...mount.descriptor,
                protocol: "lenso-console-rpc/2",
                targetId: target.id,
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
        (mount.descriptor.targetId !== undefined &&
          mount.descriptor.targetId !== target.id) ||
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
        const methods = new Set(
          service.operations.map((operation) => operation.method)
        );
        const streams = service.streams ?? [];
        validateOperations(
          [service.manage.plugin],
          streams.map((stream) => stream.operation)
        );
        for (const stream of streams) {
          const { operation } = stream;
          const budget = stream.maxItemBytes ?? 48 * 1024;
          if (
            operation.plugin !== service.manage.plugin ||
            operation.effect !== "read" ||
            operation.destructive === true ||
            operation.confirmation !== undefined ||
            operation.approval !== undefined ||
            !stream.output?.["~standard"] ||
            typeof stream.output["~standard"].validate !== "function" ||
            stream.output["~standard"].version !== 1 ||
            methods.has(operation.method) ||
            operations.some(
              (finite) =>
                finite.plugin === operation.plugin &&
                finite.method === operation.method
            ) ||
            !Number.isSafeInteger(budget) ||
            budget < 1 ||
            budget > 1024 * 1024
          ) {
            throw new Error(
              "Workspace streams require unique ungated read operations, an item schema and a bounded item budget."
            );
          }
          const installed = running.get(operation.plugin);
          if (
            installed === null ||
            typeof installed !== "object" ||
            !Object.hasOwn(installed, operation.method) ||
            typeof Reflect.get(installed, operation.method) !== "function"
          ) {
            throw new Error(
              "Workspace stream must select an installed own service method."
            );
          }
          methods.add(operation.method);
        }
      }
      const requirements = new Set<string>();
      for (const requirement of descriptor.requirements) {
        const service = mount.services[requirement.service_id];
        if (
          requirements.has(requirement.service_id) ||
          (service &&
            requirement.source === "owner" &&
            service.manage.plugin.id !== mount.descriptor.owner.instance)
        ) {
          throw new Error(
            "Workspace requirements must uniquely bind their declared service owner."
          );
        }
        requirements.add(requirement.service_id);
        if (
          requirement.required &&
          (!requirement.available ||
            !service ||
            requirement.operations.some(
              (method) =>
                !service.operations.some((op) => op.method === method) &&
                !service.streams?.some(
                  (stream) => stream.operation.method === method
                )
            ))
        ) {
          throw new Error(
            "Required workspace services must be explicitly admitted."
          );
        }
      }
      descriptor.requirements = descriptor.requirements.map((requirement) => ({
        ...requirement,
        streaming_operations: (
          mount.services[requirement.service_id]?.streams ?? []
        )
          .filter(
            (stream) =>
              requirement.available &&
              requirement.operations.includes(stream.operation.method)
          )
          .map((stream) => stream.operation.method),
      }));
      const subject =
        descriptor.subject.kind === "console" ? "console" : target.id;
      const routeBase = basePath(descriptor.basePath ?? "/");
      if (
        mount.placement !== "global" &&
        mountRoutes.some(
          (route) =>
            route.subject === subject && overlaps(route.base, routeBase)
        )
      ) {
        throw new Error("Console workspace route ownership overlaps.");
      }
      if (mount.placement !== "global") {
        mountRoutes.push({ subject, base: routeBase });
      }
      const services = Object.fromEntries(
        Object.entries(mount.services).map(([id, service]) => [
          id,
          Object.freeze({
            manage: defineManage(service.manage),
            operations: Object.freeze(
              service.operations.map(snapshotOperation)
            ),
            streams: Object.freeze(
              (service.streams ?? []).map((stream) =>
                Object.freeze({
                  ...stream,
                  operation: snapshotOperation(stream.operation),
                })
              )
            ),
          }),
        ])
      );
      mounts.set(descriptor.id, {
        target,
        mount: { ...mount, descriptor, services },
      });
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
  const authorizeInvocation = async (
    target: ConsoleTarget,
    identity: ConsoleIdentity,
    operation: Operation,
    mount?: ConsoleMount
  ) => {
    if (mount?.descriptor.access === "administrator") {
      await auth.enforce(identity, resource(target, "admin", undefined, mount));
    }
    await auth.enforce(identity, resource(target, "invoke", operation, mount));
    if (!writable(operation, target, mount)) {
      throw failure("FORBIDDEN", 403);
    }
  };
  const bindInvocation = async (
    target: ConsoleTarget,
    request: Request,
    identity: ConsoleIdentity,
    operation: Operation,
    input: unknown,
    mount?: ConsoleMount
  ) => {
    checkAbort(request);
    await authorizeInvocation(target, identity, operation, mount);
    const binding = await options.binding(
      operation,
      input,
      request,
      identity,
      resource(target, "invoke", operation, mount)
    );
    checkAbort(request);
    await authorizeInvocation(target, identity, operation, mount);
    checkAbort(request);
    return {
      ...binding,
      signal: binding.signal
        ? AbortSignal.any([request.signal, binding.signal])
        : request.signal,
    };
  };
  const adapter = (
    target: ConsoleTarget,
    request: Request,
    identity: ConsoleIdentity,
    operations?: readonly Operation[],
    mount?: ConsoleMount
  ) =>
    createManageAdapter({
      selection: selections.get(target)!,
      canList: (operation) =>
        (!operations ||
          operations.some(
            (selected) =>
              selected.plugin === operation.plugin &&
              selected.method === operation.method
          )) &&
        auth.can(identity, resource(target, "list", operation, mount)),
      binding: (operation, input) =>
        bindInvocation(target, request, identity, operation, input, mount),
    });
  async function invoke(
    target: ConsoleTarget,
    pluginId: string,
    method: string,
    input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    operations?: readonly Operation[],
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
    responseHeaders: Headers;
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
          const entries = await adapter(target, request, identity).catalog();
          // Manage keys and redacted names are opaque. Project write availability
          // through the same selection instead of reconstructing its operations.
          const availableKeys = new Set<string>();
          if (
            options.canWrite &&
            entries.some((entry) => entry.effect !== "read")
          ) {
            const availableEntries = await createManageAdapter({
              selection: selections.get(target)!,
              canList: (operation) =>
                writable(operation, target) &&
                auth.can(identity, resource(target, "list", operation)),
              binding: (operation, validatedInput) =>
                bindInvocation(
                  target,
                  request,
                  identity,
                  operation,
                  validatedInput
                ),
            }).catalog();
            for (const entry of availableEntries) {
              availableKeys.add(entry.key);
            }
          }
          for (const entry of entries) {
            const available =
              entry.effect === "read" || availableKeys.has(entry.key);
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
                  configuration: {
                    ...(running.configuration?.(plugin) ?? {
                      state: "unavailable" as const,
                      fields: [],
                      sources: [],
                    }),
                    writable: false,
                    unavailableReason:
                      "Startup configuration is read-only here. Change the application-owned source and restart.",
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
      subscribe: implementation.workspace.subscribe.handler(
        async ({
          input,
          signal: procedureSignal,
          context: { request, identity, responseHeaders },
        }) => {
          let initialized!: () => void;
          const initialization = new Promise<void>((resolve) => {
            initialized = resolve;
          });
          openings.add(initialization);
          let operation: Operation | undefined;
          const controller = new AbortController();
          const sanitized = new WeakSet<Error>();
          const sanitize = (error: unknown) => {
            if (error instanceof Error && sanitized.has(error)) {
              return error;
            }
            const safe = rpcFailure(
              safeError(operation ? operationError(operation, error) : error),
              responseHeaders
            );
            sanitized.add(safe);
            return safe;
          };
          try {
            const { target, mount } = workspace(input.mountId, request);
            const requirement = mount.descriptor.requirements.find(
              (entry) => entry.service_id === input.service
            );
            const service = Object.hasOwn(mount.services, input.service)
              ? mount.services[input.service]
              : undefined;
            const stream = service?.streams?.find(
              (entry) => entry.operation.method === input.operation
            );
            if (
              !requirement?.available ||
              !requirement.operations.includes(input.operation) ||
              !stream
            ) {
              throw failure("NOT_FOUND", 404);
            }
            ({ operation } = stream);
            const expected = expectedConsoleSubject(request);
            if (expected !== null && expected !== identity.actor.subjectId) {
              throw failure("PRECONDITION_FAILED", 412);
            }
            const checkCurrent = async () => {
              checkAbort(request);
              lifecycle.signal.throwIfAborted();
              procedureSignal?.throwIfAborted();
              workspace(input.mountId, request);
              const current = await auth.authenticate(request);
              if (
                current.actor.subjectId !== identity.actor.subjectId ||
                current.actor.realmId !== identity.actor.realmId ||
                current.actor.audience !== identity.actor.audience ||
                current.actor.kind !== identity.actor.kind ||
                current.readScope !== identity.readScope
              ) {
                throw failure("PRECONDITION_FAILED", 412);
              }
              await auth.enforce(
                current,
                resource(target, "list", undefined, mount)
              );
              await auth.enforce(
                current,
                resource(target, "list", stream.operation, mount)
              );
              await authorizeInvocation(
                target,
                current,
                stream.operation,
                mount
              );
            };
            await checkCurrent();
            jsonInput(input.input);
            const validated = await validateOperationInput(
              operation,
              input.input
            );
            const signals = [
              request.signal,
              controller.signal,
              lifecycle.signal,
            ];
            if (procedureSignal) {
              signals.push(procedureSignal);
            }
            const entrySignal = AbortSignal.any(signals);
            const bindingRequest = new Request(request, {
              signal: entrySignal,
            });
            const binding = await bindInvocation(
              target,
              bindingRequest,
              identity,
              operation,
              validated,
              mount
            );
            await checkCurrent();
            const signal = AbortSignal.any([entrySignal, binding.signal]);
            signal.throwIfAborted();
            if (operation.context && binding.context === undefined) {
              throw failure("SERVICE_UNAVAILABLE", 503);
            }
            const producer = await executeOperation(
              target.running ?? runtime,
              operation,
              validated,
              binding.context
            );
            if (
              !producer ||
              typeof producer !== "object" ||
              !("next" in producer) ||
              typeof producer.next !== "function" ||
              !("return" in producer) ||
              typeof producer.return !== "function"
            ) {
              throw failure("SERVICE_UNAVAILABLE", 503);
            }
            const maxBytes = stream.maxItemBytes ?? 48 * 1024;
            const close = () => iterator.return();
            const releaseSubscription = (error?: Error) => {
              subscriptions.delete(close);
              cleanupFailure ??= error;
            };
            const iterator = subscription(
              producer as AsyncIterator<unknown>,
              controller,
              signal,
              async (value) => {
                signal.throwIfAborted();
                await checkCurrent();
                // Bound the private item before projection as well as its public DTO.
                boundedJson(value, maxBytes);
                const projected =
                  await stream.output["~standard"].validate(value);
                if (projected.issues) {
                  throw failure("SERVICE_UNAVAILABLE", 503);
                }
                const json = boundedJson(projected.value, maxBytes);
                const safe = redact(JSON.parse(json), environmentSecrets());
                boundedJson(safe, maxBytes);
                signal.throwIfAborted();
                await checkCurrent();
                signal.throwIfAborted();
                return safe;
              },
              sanitize,
              releaseSubscription
            );
            subscriptions.add(close);
            return iterator;
          } catch (error) {
            controller.abort();
            throw sanitize(error);
          } finally {
            openings.delete(initialization);
            initialized();
          }
        }
      ),
      invoke: implementation.workspace.invoke.handler(
        async ({ input, context: { request, identity, responseHeaders } }) => {
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
            throw rpcFailure(safe, responseHeaders);
          }
        }
      ),
    },
  });
  const rpc = new RPCHandler(router, {
    errorStatusMap: COMMON_ERROR_STATUS_MAP,
    clientInterceptors: [
      async ({ next, context }) => {
        try {
          return await next();
        } catch (error) {
          if (error instanceof ORPCError && error.code !== "BAD_REQUEST") {
            throw error;
          }
          throw rpcFailure(safeError(error), context.responseHeaders);
        }
      },
    ],
  });
  const prefix: `/${string}` = `${api}/console`;
  return {
    close() {
      closing ??= (async () => {
        const owned = new Set(subscriptions);
        for (const selection of selections.values()) {
          selection.close();
        }
        lifecycle.abort();
        await Promise.allSettled(new Set(openings));
        for (const close of subscriptions) {
          owned.add(close);
        }
        const results = await Promise.allSettled(
          [...owned].map((close) => close())
        );
        const errors = results
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason);
        if (cleanupFailure) {
          errors.push(cleanupFailure);
        }
        if (errors.length) {
          throw new AggregateError(
            errors,
            "Console subscriptions could not close"
          );
        }
      })();
      return closing;
    },
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
        if (
          request.method === "GET" &&
          path === `${prefix}/v1/locale` &&
          !(auth.hasCredentials
            ? auth.hasCredentials(request)
            : request.headers.has("authorization") ||
              request.headers.has("cookie"))
        ) {
          return await locale.snapshot(undefined, request.signal);
        }
        const identity = await auth.authenticate(request);
        checkAbort(request);
        let response: Response | undefined;
        if (
          path === `${prefix}/v1/locale` ||
          path.startsWith(`${prefix}/v1/locale/`)
        ) {
          response = await locale.fetch(
            request,
            path.slice(`${prefix}/v1/locale`.length),
            identity
          );
        } else if (
          request.method === "GET" &&
          path === `${prefix}/v1/session`
        ) {
          const session = await auth.session(identity);
          response = Response.json({
            mode: "required",
            authenticated: true,
            subject: identity.actor.subjectId,
            ...session,
            assistant_enabled: false,
            human_management_enabled: false,
            management_enabled: options.management === true,
            management_protocol: "lenso-console-rpc/2",
            capabilities: {
              locale: options.locale ? "available" : "unavailable",
              pluginConfiguration: "read-only",
              pluginConfigurationWrite: {
                available: false,
                reason:
                  "Startup configuration is read-only here. Change the application-owned source and restart.",
              },
              agent: {
                available: false,
                reason:
                  "No Agent transport is installed in this TypeScript application.",
              },
            },
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
                pluginConfiguration: true,
                agentId: null,
                localBundleInstall: false,
              });
            }
          }
          response = Response.json({ apps: permitted });
        } else if (
          request.method === "GET" &&
          [`${prefix}/v1/pages`, `${prefix}/v1/surfaces`].includes(path)
        ) {
          const visible = [];
          for (const { target, mount } of mounts.values()) {
            if (
              (mount.placement === "global") !==
              (path === `${prefix}/v1/surfaces`)
            ) {
              continue;
            }
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
              const requirements = [];
              for (const requirement of mount.descriptor.requirements) {
                const service = mount.services[requirement.service_id];
                const methods: string[] = [];
                const streamingMethods: string[] = [];
                const declaredStreams = service?.streams ?? [];
                for (const operation of [
                  ...(service?.operations ?? []),
                  ...declaredStreams.map((stream) => stream.operation),
                ]) {
                  if (
                    requirement.operations.includes(operation.method) &&
                    writable(operation, target, mount) &&
                    (await auth.can(
                      identity,
                      resource(target, "invoke", operation, mount)
                    )) &&
                    (await auth.can(
                      identity,
                      resource(target, "list", operation, mount)
                    ))
                  ) {
                    methods.push(operation.method);
                    if (
                      declaredStreams.some(
                        (stream) => stream.operation === operation
                      )
                    ) {
                      streamingMethods.push(operation.method);
                    }
                  }
                }
                requirements.push({
                  ...requirement,
                  operations: methods,
                  streaming_operations: streamingMethods,
                  available:
                    requirement.available &&
                    options.management === true &&
                    methods.length > 0 &&
                    (!requirement.required ||
                      requirement.operations.every((method) =>
                        methods.includes(method)
                      )),
                });
              }
              const credentials: { issuePath?: string; rotatePath?: string } =
                {};
              if (mount.credentials) {
                for (const operation of ["issue", "rotate"] as const) {
                  if (
                    await auth.can(
                      identity,
                      mount.credentials.resources[operation]
                    )
                  ) {
                    credentials[`${operation}Path`] =
                      mount.credentials[`${operation}Path`];
                  }
                }
              }
              visible.push({
                ...mount.descriptor,
                credentials: Object.keys(credentials).length
                  ? credentials
                  : undefined,
                requirements,
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
          const responseHeaders = new Headers();
          const result = await rpc.handle(await boundedRpcRequest(request), {
            prefix: `${prefix}/v2/rpc`,
            context: { request, identity, responseHeaders },
          });
          response = result.matched ? result.response : undefined;
          if (response && responseHeaders.has("retry-after")) {
            response.headers.set(
              "retry-after",
              responseHeaders.get("retry-after")!
            );
          }
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
        const headers = new Headers({ "cache-control": "no-store" });
        const errorBody = rpcFailure(safe, headers).toJSON();
        return Response.json(
          path.startsWith(`${prefix}/v2/rpc/`)
            ? { json: errorBody }
            : errorBody,
          {
            status: safe.status,
            headers,
          }
        );
      }
    },
  };
}
