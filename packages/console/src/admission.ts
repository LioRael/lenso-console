import { consolePageDescriptorSchema } from "@lenso/console-sdk/protocol";
import { environmentSecrets, redact } from "@lenso/engine/diagnostics";
import { boundedJson, validateOperations } from "@lenso/engine/operations";
import {
  createManageSelection,
  defineManage,
  type ManageSelection,
} from "@lenso/manage";

import { snapshotOperation } from "./operation-selection";
import type {
  ConsoleMount,
  ConsoleMountService,
  ConsoleRuntime,
  ConsoleTarget,
} from "./types";

export function mountedOperationMethod(
  service: ConsoleMountService,
  name: string
): string {
  return service.operationAliases &&
    Object.hasOwn(service.operationAliases, name)
    ? service.operationAliases[name]!
    : name;
}

export function basePath(value: string): "" | `/${string}` {
  if (
    !/^\/(?:[a-zA-Z0-9._~-]+\/)*[a-zA-Z0-9._~-]*$/.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("Console base paths must be absolute safe paths.");
  }
  return value === "/" ? "" : `/${value.slice(1).replace(/\/$/, "")}`;
}

export function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function relativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !/[\\?#%]/u.test(value) &&
    !hasControlCharacter(value) &&
    value
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

export function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || code === 0x7f;
  });
}

export function admitTargets(
  runtime: ConsoleRuntime,
  selected: readonly ConsoleTarget[],
  api: string
) {
  const targets = selected.map((target) => ({
    ...target,
    plugins: [...target.plugins],
    manage: [...target.manage],
    mounts: [...(target.mounts ?? [])],
  }));
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
        const destinations = new Set<string>();
        for (const [name, method] of Object.entries(
          service.operationAliases ?? {}
        )) {
          if (
            !/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(name) ||
            !methods.has(method) ||
            (methods.has(name) && name !== method) ||
            destinations.has(method)
          ) {
            throw new Error(
              "Workspace operation aliases must uniquely name admitted methods without collisions."
            );
          }
          destinations.add(method);
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
                !service.operations.some(
                  (op) => op.method === mountedOperationMethod(service, method)
                ) &&
                !service.streams?.some(
                  (stream) =>
                    stream.operation.method ===
                    mountedOperationMethod(service, method)
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
        streaming_operations: requirement.available
          ? requirement.operations.filter((name) => {
              const service = mount.services[requirement.service_id];
              return service?.streams?.some(
                (stream) =>
                  stream.operation.method ===
                  mountedOperationMethod(service, name)
              );
            })
          : [],
      }));
      const subject =
        descriptor.subject.kind === "console" ? "console" : target.id;
      const routeBase = basePath(descriptor.basePath ?? "/");
      if (mount.placement !== "global") {
        if (
          mountRoutes.some(
            (route) =>
              route.subject === subject && overlaps(route.base, routeBase)
          )
        ) {
          throw new Error("Console workspace route ownership overlaps.");
        }
        mountRoutes.push({ subject, base: routeBase });
      }
      const services = Object.fromEntries(
        Object.entries(mount.services).map(([id, service]) => [
          id,
          Object.freeze({
            manage: defineManage(service.manage),
            operationAliases: service.operationAliases
              ? Object.freeze({ ...service.operationAliases })
              : undefined,
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
  return { targets, mounts, selections };
}
