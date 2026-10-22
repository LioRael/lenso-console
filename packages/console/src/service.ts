import {
  consoleAppsCatalogSchema,
  consoleAdmissionSchema,
  consoleContract,
  consolePageCatalogSchema,
  consolePageOperationContextSchema,
  consoleOperationInspectionSchema,
  consolePluginDescriptorSchema,
  consoleSessionSchema,
  consoleTargetDescriptorSchema,
  executionEvidenceHeader,
  executionEvidenceHeaderValue,
  projectExecutionEvidence,
  type ConsoleOperationDescriptor,
} from "@lenso/console-sdk/protocol";
import { environmentSecrets, redact } from "@lenso/engine/diagnostics";
import {
  boundedJson,
  describeOperation,
  executeOperation,
  operationError,
  validateOperationInput,
  type Operation,
} from "@lenso/engine/operations";
import { createManageAdapter } from "@lenso/manage";
import { COMMON_ERROR_STATUS_MAP, implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersHandlerPlugin } from "@orpc/server/plugins";

import {
  admitTargets,
  basePath,
  mountedOperationMethod,
  overlaps,
  relativePath,
} from "./admission";
import { ConsoleRequestError, expectedConsoleSubject } from "./auth";
import {
  boundedRpcRequest,
  checkAbort,
  failure,
  jsonInput,
  rpcFailure,
  safeError,
} from "./boundary";
import { createLocaleRoutes } from "./locale";
import { projectOperationMetadata } from "./operation-metadata";
import { subscription } from "./subscription";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleReadScope,
  ConsoleMount,
  ConsoleOptions,
  ConsoleResource,
  ConsoleRuntime,
  ConsoleService,
  ConsoleTarget,
} from "./types";

function captureExecutionEvidence(headers: Headers | undefined) {
  headers?.delete(executionEvidenceHeader);
  return (actual: unknown) => {
    if (!headers) {
      return;
    }
    try {
      // Only the canonical public identifiers enter metadata. Never serialize
      // invocation input, context, credentials, baggage or span attributes.
      const value = executionEvidenceHeaderValue(
        redact(projectExecutionEvidence(actual), environmentSecrets())
      );
      if (value) {
        headers.set(executionEvidenceHeader, value);
      } else {
        headers.delete(executionEvidenceHeader);
      }
    } catch {
      // Optional evidence must not replace the business result or error.
    }
  };
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
    auth.httpPaths &&
    (auth.httpPaths.discovery !== `${authBase}/methods` ||
      auth.httpPaths.owned.some((path) => !path.startsWith(`${authBase}/`)))
  ) {
    throw new Error(
      "Auth binding paths must match the configured Console Auth namespace."
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
  const { targets, mounts, selections } = admitTargets(
    runtime,
    options.targets,
    api
  );
  const locale = createLocaleRoutes(
    options.locale ? runtime.get(options.locale) : undefined,
    auth,
    options.localeResource
  );

  const inspector = options.operationInspection
    ? runtime.get(options.operationInspection)
    : undefined;
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
    mount?: ConsoleMount,
    prepared?: Set<Operation>,
    readScope?: ConsoleReadScope
  ) => {
    checkAbort(request);
    if (
      prepared &&
      !mount &&
      operation.effect === "read" &&
      options.prepareBinding
    ) {
      const binding = options.prepareBinding(
        operation,
        input,
        request,
        identity,
        resource(target, "invoke", operation, mount),
        readScope
      );
      if (
        binding &&
        typeof (binding as { then?: unknown }).then === "function"
      ) {
        // Reject synchronously while draining an invalid async host callback.
        // oxlint-disable-next-line promise/prefer-await-to-then, no-empty-function
        void Promise.resolve(binding).catch(() => {});
        throw failure("SERVICE_UNAVAILABLE", 503);
      }
      if (binding !== undefined) {
        checkAbort(request);
        prepared.add(operation);
        return {
          ...binding,
          signal: binding.signal
            ? AbortSignal.any([request.signal, binding.signal])
            : request.signal,
        };
      }
    }
    if (readScope) {
      throw failure("SERVICE_UNAVAILABLE", 503);
    }
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
    mount?: ConsoleMount,
    readScope?: ConsoleReadScope,
    capture?: (actual: unknown) => void
  ) => {
    const prepared = new Set<Operation>();
    return createManageAdapter({
      selection: selections.get(target)!,
      catalogConcurrency: options.catalogConcurrency,
      canList: async (operation) => {
        if (
          operations &&
          !operations.some(
            (selected) =>
              selected.plugin === operation.plugin &&
              selected.method === operation.method
          )
        ) {
          return false;
        }
        const visible = resource(target, "list", operation, mount);
        if (prepared.delete(operation)) {
          if (operation.effect !== "read") {
            return false;
          }
          const invocation = resource(target, "invoke", operation, mount);
          if (readScope) {
            return auth.canDispatchRead!(
              identity,
              visible,
              invocation,
              readScope
            );
          }
          if (auth.canDispatch) {
            return auth.canDispatch(identity, visible, invocation);
          }
          if (!(await auth.can(identity, visible))) {
            return false;
          }
          await auth.enforce(identity, invocation);
          return true;
        }
        return readScope
          ? auth.canRead!(identity, visible, readScope)
          : auth.can(identity, visible);
      },
      binding: async (operation, input) => {
        const binding = await bindInvocation(
          target,
          request,
          identity,
          operation,
          input,
          mount,
          prepared,
          readScope
        );
        if (!capture) {
          return binding;
        }
        return {
          ...binding,
          onExecutionEvidence(actual: unknown) {
            capture(actual);
            // Keep host observers, including their async rejection isolation.
            const observer = Reflect.get(binding, "onExecutionEvidence");
            if (typeof observer === "function") {
              return Reflect.apply(observer, undefined, [actual]);
            }
          },
        };
      },
    });
  };
  async function invoke(
    target: ConsoleTarget,
    pluginId: string,
    method: string,
    input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    operations?: readonly Operation[],
    mount?: ConsoleMount,
    readScope?: ConsoleReadScope,
    capture?: (actual: unknown) => void
  ) {
    checkAbort(request);
    jsonInput(input);
    const result = await adapter(
      target,
      request,
      identity,
      operations,
      mount,
      readScope,
      capture
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
  const scopedCatalog = !!(
    options.catalogRead &&
    options.onReadScope &&
    auth.beginRead &&
    auth.enforceRead &&
    auth.finishRead &&
    auth.closeRead
  );
  const deniedMetadataScopes = new WeakMap<ConsoleReadScope, boolean>();

  async function canReadMetadata(
    identity: ConsoleIdentity,
    selector: ConsoleResource,
    scope?: ConsoleReadScope
  ) {
    if (!scope) {
      return auth.can(identity, selector);
    }
    try {
      await auth.enforceRead!(identity, selector, scope);
    } catch (error) {
      // Manage may project the error at its own boundary. Keep only the exact
      // originating policy denial eligible for legacy metadata filtering.
      deniedMetadataScopes.set(
        scope,
        error instanceof ConsoleRequestError && error.code === "forbidden"
      );
      throw error;
    }
    return true;
  }

  async function metadataRead<T>(
    request: Request,
    identity: ConsoleIdentity,
    enabled: boolean,
    collect: (scope?: ConsoleReadScope) => Promise<T>
  ): Promise<T> {
    if (!enabled) {
      return collect();
    }
    if (
      !options.onReadScope ||
      !auth.beginRead ||
      !auth.enforceRead ||
      !auth.finishRead ||
      !auth.closeRead
    ) {
      throw failure("SERVICE_UNAVAILABLE", 503);
    }
    const scope = await auth.beginRead(identity, request);
    try {
      if (
        "consistency" in scope.authenticationScope &&
        scope.authenticationScope.consistency !== "before-disclosure"
      ) {
        throw failure("SERVICE_UNAVAILABLE", 503);
      }
      const result = await collect(scope);
      const registered: unknown = options.onReadScope(request, scope);
      if (
        registered &&
        typeof (registered as { then?: unknown }).then === "function"
      ) {
        // oxlint-disable-next-line promise/prefer-await-to-then, no-empty-function
        void Promise.resolve(registered).catch(() => {});
        throw failure("SERVICE_UNAVAILABLE", 503);
      }
      // The existing host disclosure boundary freshly verifies identity and replays
      // every successful policy. No authority is reused by another HTTP request.
      return result;
    } catch (error) {
      auth.closeRead(scope);
      if (deniedMetadataScopes.get(scope)) {
        // Filtering a denied item retires the scope; retry via ordinary fresh checks.
        return collect();
      }
      throw error;
    }
  }
  async function collectCatalog(
    request: Request,
    identity: ConsoleIdentity,
    targetId?: string,
    scope?: ConsoleReadScope
  ) {
    const can = (selector: ConsoleResource) =>
      canReadMetadata(identity, selector, scope);
    const catalogFor = (target: ConsoleTarget, writeAvailability = false) =>
      createManageAdapter({
        selection: selections.get(target)!,
        // Scoped policies share one request identity; no D1 fan-out is needed.
        catalogConcurrency: scope ? 1 : options.catalogConcurrency,
        canList: (operation) =>
          (!writeAvailability || writable(operation, target)) &&
          can(resource(target, "list", operation)),
        binding: (operation, validatedInput) =>
          bindInvocation(target, request, identity, operation, validatedInput),
      }).catalog();
    const operations: ConsoleOperationDescriptor[] = [];
    for (const target of targetId ? [findTarget(targetId)] : targets) {
      if (!(await can(resource(target, "list")))) {
        continue;
      }
      const entries = await catalogFor(target);
      // Manage keys and redacted names are opaque. Project write availability
      // through the same selection instead of reconstructing its operations.
      const availableKeys = new Set<string>();
      if (
        options.canWrite &&
        entries.some((entry) => entry.effect !== "read")
      ) {
        const availableEntries = await catalogFor(target, true);
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
          metadata: projectOperationMetadata(entry),
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
    return {
      schemaVersion: 1 as const,
      revision: catalogRevision,
      operations,
    };
  }
  async function collectPages(
    identity: ConsoleIdentity,
    global: boolean,
    scope?: ConsoleReadScope
  ) {
    const can = (selector: ConsoleResource) =>
      canReadMetadata(identity, selector, scope);
    const visible = [];
    for (const { target, mount } of mounts.values()) {
      if ((mount.placement === "global") !== global) {
        continue;
      }
      if (
        await can(
          resource(
            target,
            mount.descriptor.access === "administrator" ? "admin" : "list",
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
          for (const name of requirement.operations) {
            const operation =
              service &&
              [
                ...service.operations,
                ...declaredStreams.map((stream) => stream.operation),
              ].find(
                (candidate) =>
                  candidate.method === mountedOperationMethod(service, name)
              );
            if (
              operation &&
              writable(operation, target, mount) &&
              (await can(resource(target, "invoke", operation, mount))) &&
              (await can(resource(target, "list", operation, mount)))
            ) {
              methods.push(name);
              if (
                declaredStreams.some((stream) => stream.operation === operation)
              ) {
                streamingMethods.push(name);
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
        const credentials: { issuePath?: string; rotatePath?: string } = {};
        if (mount.credentials) {
          for (const operation of ["issue", "rotate"] as const) {
            if (await can(mount.credentials.resources[operation])) {
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
    return consolePageCatalogSchema.parse({
      schema: "console.page-catalog/1",
      mounts: visible,
    });
  }
  async function collectSession(
    identity: ConsoleIdentity,
    scope?: ConsoleReadScope
  ) {
    if (scope && !auth.sessionRead) {
      throw failure("SERVICE_UNAVAILABLE", 503);
    }
    const session = scope
      ? await auth.sessionRead!(identity, scope)
      : await auth.session(identity);
    const access = await Promise.all(
      targets.map(async (target) =>
        canReadMetadata(identity, resource(target, "session"), scope)
      )
    );
    return consoleSessionSchema.parse({
      mode: "required",
      authenticated: true,
      subject: identity.actor.subjectId,
      ...session,
      console_access: access.some(Boolean),
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
  }
  const implementation = implement(consoleContract).$context<{
    request: Request;
    identity: ConsoleIdentity;
    responseHeaders: Headers;
    resHeaders?: Headers;
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
      async ({ input, context: { request, identity } }) =>
        metadataRead(request, identity, scopedCatalog, (scope) =>
          collectCatalog(request, identity, input.targetId, scope)
        )
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
      async ({ input, context: { request, identity, resHeaders } }) => {
        const target = findTarget(input.targetId);
        if ("key" in input) {
          const keyPrefix = `${catalogRevision}:${target.id}:`;
          if (!input.key.startsWith(keyPrefix)) {
            throw failure("CONFLICT", 409);
          }
          checkAbort(request);
          jsonInput(input.input);
          const result = await adapter(
            target,
            request,
            identity,
            undefined,
            undefined,
            undefined,
            captureExecutionEvidence(resHeaders)
          ).invokeEntry(input.key.slice(keyPrefix.length), input.input);
          checkAbort(request);
          return result;
        }
        let readScope: ConsoleReadScope | undefined;
        const selected = target.manage
          .flatMap((manage) => [...manage.operations])
          .find(
            (operation) =>
              operation.plugin.id === input.pluginId &&
              operation.method === input.method
          );
        if (
          selected &&
          selected.effect === "read" &&
          options.prepareBinding &&
          options.onReadScope &&
          options.readScopeEligible?.(
            selected,
            input.input,
            resource(target, "invoke", selected)
          ) === true &&
          auth.beginRead &&
          auth.canRead &&
          auth.canDispatchRead &&
          auth.finishRead &&
          auth.closeRead
        ) {
          readScope = await auth.beginRead(identity, request);
          try {
            const registration: unknown = options.onReadScope(
              request,
              readScope
            );
            if (
              registration &&
              typeof (registration as { then?: unknown }).then === "function"
            ) {
              // oxlint-disable-next-line promise/prefer-await-to-then, no-empty-function
              void Promise.resolve(registration).catch(() => {});
              throw failure("SERVICE_UNAVAILABLE", 503);
            }
          } catch (error) {
            auth.closeRead(readScope);
            throw error;
          }
        }
        try {
          return await invoke(
            target,
            input.pluginId,
            input.method,
            input.input,
            request,
            identity,
            undefined,
            undefined,
            readScope,
            captureExecutionEvidence(resHeaders)
          );
        } catch (error) {
          if (readScope) {
            auth.closeRead!(readScope);
          }
          throw error;
        }
      }
    ),
    workspace: {
      inspect: implementation.workspace.inspect.handler(
        async ({ input, context: { request, identity } }) => {
          const { target, mount } = workspace(input.mountId, request);
          const expected = expectedConsoleSubject(request);
          if (expected !== null && expected !== identity.actor.subjectId) {
            throw failure("PRECONDITION_FAILED", 412);
          }
          const checkCurrent = async () => {
            checkAbort(request);
            lifecycle.signal.throwIfAborted();
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
              resource(
                target,
                mount.descriptor.access === "administrator" ? "admin" : "list",
                undefined,
                mount
              )
            );
            return current;
          };
          const current = await checkCurrent();
          const requirement = mount.descriptor.requirements.find(
            (entry) => entry.service_id === input.service
          );
          const service = Object.hasOwn(mount.services, input.service)
            ? mount.services[input.service]
            : undefined;
          if (!requirement || !service) {
            throw failure("NOT_FOUND", 404);
          }
          const names = requirement.operations.filter(
            (name) => input.operation === undefined || name === input.operation
          );
          const selected = names.slice(
            input.offset,
            input.offset + input.limit
          );
          const operations = [];
          const visible = [];
          for (const name of selected) {
            const operation = [
              ...service.operations,
              ...(service.streams ?? []).map((stream) => stream.operation),
            ].find(
              (candidate) =>
                candidate.method === mountedOperationMethod(service, name)
            );
            if (
              !operation ||
              !(await auth.can(
                current,
                resource(target, "list", operation, mount)
              ))
            ) {
              continue;
            }
            visible.push(operation);
            operations.push({
              name,
              pluginId: operation.plugin.id,
              method: operation.method,
              effect: operation.effect ?? "unknown",
              metadata: projectOperationMetadata(
                describeOperation(operation, "")
              ),
              ...(inspector
                ? {
                    inspection: consoleOperationInspectionSchema.parse(
                      await inspector.read({
                        targetId: target.id,
                        mountId: mount.descriptor.id,
                        revision: mount.descriptor.revision,
                        service: input.service,
                        name,
                        operation,
                        request,
                        identity: current,
                        resource: resource(target, "list", operation, mount),
                      })
                    ),
                  }
                : {}),
            });
          }
          const latest = await checkCurrent();
          for (const operation of visible) {
            await auth.enforce(
              latest,
              resource(target, "list", operation, mount)
            );
          }
          const result = consolePageOperationContextSchema.parse(
            redact(
              {
                schema: "console.page-operation-context/1",
                provenance: "admitted-declaration",
                availability: "unverified",
                page: {
                  targetId: target.id,
                  mountId: mount.descriptor.id,
                  revision: mount.descriptor.revision,
                  implementationId: mount.descriptor.implementationId,
                  ownerInstance: mount.descriptor.owner.instance,
                },
                service: input.service,
                operations,
                nextOffset:
                  input.offset + input.limit < names.length
                    ? input.offset + input.limit
                    : null,
                runtime: inspector
                  ? { availability: "operation-scoped" }
                  : {
                      availability: "unavailable",
                      reason: "runtime-binding-not-configured",
                    },
                recentFailures: inspector
                  ? { availability: "operation-scoped" }
                  : {
                      availability: "unavailable",
                      reason: "collector-not-configured",
                    },
              },
              environmentSecrets()
            )
          );
          boundedJson(result, 262144);
          return result;
        }
      ),
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
              (entry) =>
                entry.operation.method ===
                mountedOperationMethod(service, input.operation)
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
        async ({
          input,
          context: { request, identity, responseHeaders, resHeaders },
        }) => {
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
              mountedOperationMethod(service, input.operation),
              input.input,
              request,
              identity,
              service.operations,
              mount,
              undefined,
              captureExecutionEvidence(resHeaders)
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
    plugins: [new ResponseHeadersHandlerPlugin()],
    errorStatusMap: { ...COMMON_ERROR_STATUS_MAP, OUTCOME_UNKNOWN: 503 },
    clientInterceptors: [
      async ({ next, context }) => {
        try {
          return await next();
        } catch (error) {
          const mapped =
            error instanceof ORPCError && error.code !== "BAD_REQUEST"
              ? error
              : rpcFailure(safeError(error), context.responseHeaders);
          if (
            ["UNAUTHORIZED", "FORBIDDEN", "PRECONDITION_FAILED"].includes(
              mapped.code
            )
          ) {
            context.resHeaders?.delete(executionEvidenceHeader);
          }
          throw mapped;
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
          response = Response.json(
            await metadataRead(
              request,
              identity,
              options.sessionRead === true,
              (scope) => collectSession(identity, scope)
            )
          );
        } else if (
          request.method === "GET" &&
          path === `${prefix}/v1/admission`
        ) {
          response = await metadataRead(
            request,
            identity,
            options.sessionRead === true,
            async (scope) => {
              const session = await collectSession(identity, scope);
              const catalogScope = scopedCatalog ? scope : undefined;
              const pages = session.console_access
                ? await collectPages(identity, false, catalogScope)
                : { schema: "console.page-catalog/1" as const, mounts: [] };
              const catalog =
                session.console_access &&
                options.management === true &&
                new URL(request.url).searchParams.get("catalog") === "1"
                  ? await collectCatalog(
                      request,
                      identity,
                      undefined,
                      catalogScope
                    )
                  : undefined;
              return Response.json(
                consoleAdmissionSchema.parse({
                  schema: "console.admission/1",
                  session,
                  pages,
                  ...(catalog ? { catalog } : {}),
                })
              );
            }
          );
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
          response = Response.json(
            consoleAppsCatalogSchema.parse({ apps: permitted })
          );
        } else if (
          request.method === "GET" &&
          [`${prefix}/v1/pages`, `${prefix}/v1/surfaces`].includes(path)
        ) {
          response = Response.json(
            await metadataRead(request, identity, scopedCatalog, (scope) =>
              collectPages(identity, path === `${prefix}/v1/surfaces`, scope)
            )
          );
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
