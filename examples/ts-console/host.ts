import { createAuthorizationInspection } from "@lenso/authorization/manage";
import type { ConsoleAuthentication, ConsoleIdentity } from "@lenso/console";
import { createConsolePlugin } from "@lenso/console";
import {
  consoleRequestErrorResponse,
  requireConsoleRequest,
} from "@lenso/console/auth";
import { createConsoleAuthorizationManage } from "@lenso/console/authorization";
import { defineApp, definePlugin } from "@lenso/core";
import { createWebPlugin } from "@lenso/web";
import { createBunListenerPlugin } from "@lenso/web/bun";

import {
  createAdministrationHost,
  createLocalAdministrationState,
  type LocalAdministration,
} from "./administration-host";
import { createAdministrationMounts } from "./administration-mount";
import { createAuthorizationMount } from "./authorization-mount";
import type { HostConfiguration } from "./configuration";
import {
  createLocalAuthentication,
  localScope,
  localTarget,
} from "./local-auth";
import { createLocalLocaleStore } from "./locale-store";
import type { createRuntimeMount as runtimeMountFactory } from "./runtime-mount";
import { createBuiltShell } from "./shell";

export async function createHost(config: HostConfiguration) {
  const state = config.administration
    ? createLocalAdministrationState(config)
    : undefined;
  const local = createLocalAuthentication(config, state);
  const administration = state
    ? createAdministrationHost(config, state, local)
    : undefined;
  let ownedState: LocalAdministration | undefined;
  let ownedAuthentication: ConsoleAuthentication | undefined;
  const inspection = definePlugin({
    id: "local-authorization-inspection",
    setup: () =>
      createAuthorizationInspection<ConsoleIdentity, "access" | "configure">({
        store: local.roleStore,
        actions: ["access", "configure"],
        authorize: (identity, scope) =>
          identity.actor.realmId === local.principal.realmId &&
          identity.actor.subjectId === local.principal.subjectId &&
          scope.type === localScope.type &&
          scope.id === localScope.id,
        authorizeBinding: (identity, binding) =>
          binding.principal.realmId === identity.actor.realmId &&
          binding.principal.subjectId === identity.actor.subjectId,
      }),
  });
  const authorization = createConsoleAuthorizationManage({
    id: "authorization",
    inspection,
    authentication: local.authentication,
    map: ({ identity }) => ({ caller: identity, scope: localScope }),
  });
  const locale = createLocalLocaleStore(config.databasePath);
  let runtime: Awaited<ReturnType<typeof runtimeMountFactory>> | undefined;
  if (config.runtimePort) {
    const { createRuntimeMount } = await import("./runtime-mount");
    runtime = await createRuntimeMount(
      local.authentication,
      config.runtimePort,
      config.apiBasePath,
      {
        ...(config.runtimeManifestPath
          ? { manifestPath: config.runtimeManifestPath }
          : {}),
        greetingTrial: config.runtimeGreetingTrial,
      }
    );
  }
  const mounts = [
    ...(administration
      ? await createAdministrationMounts(administration, config.apiBasePath)
      : [await createAuthorizationMount(authorization, config.apiBasePath)]),
    ...(runtime ? [runtime.mount] : []),
  ];
  const shell = await createBuiltShell(config.shellDirectory, {
    ...config,
    workspaces: mounts.flatMap((mount) =>
      mount.descriptor.basePath ? [mount.descriptor.basePath] : []
    ),
  });
  const consoleDefinition = createConsolePlugin({
    authentication: local.authentication,
    apiBasePath: config.apiBasePath,
    authBasePath: config.authBasePath,
    management: true,
    canWrite: (operation, resource) =>
      !!administration &&
      resource.targetId === localTarget &&
      resource.tenantId === localScope.id &&
      operation.plugin === administration.plugin &&
      administration.operations.some(
        (selected) =>
          selected.method === operation.method && selected.effect === "write"
      ),
    locale,
    localeResource: {
      action: "configure",
      targetId: localTarget,
      tenantId: localScope.id,
      pluginId: locale.id,
      operation: "console.locale.default.manage",
    },
    targets: [
      {
        id: localTarget,
        label: "Local operator application",
        tenantId: localScope.id,
        plugins: [
          ...(administration
            ? [administration.plugin]
            : [authorization.plugin]),
          locale,
          ...(runtime ? [runtime.inspection.plugin] : []),
        ],
        manage: [
          ...(administration
            ? [administration.manage]
            : [authorization.manage]),
          ...(runtime ? [runtime.inspection.manage] : []),
        ],
        mounts,
      },
    ],
    binding: (operation, _input, request, identity, resource) => ({
      context:
        administration && operation.plugin === administration.plugin
          ? administration.binding(ownedState!, identity, request.signal, () =>
              ownedAuthentication!.enforce(identity, resource)
            )
          : runtime?.inspection.operations.some(
                (selected) =>
                  selected.plugin === operation.plugin &&
                  selected.method === operation.method
              )
            ? { evidence: { identity, resource, request } }
            : { identity, resource, request },
      signal: request.signal,
    }),
    shellMatches: shell.matches,
    shell: shell.fetch,
  });
  const consolePlugin = state
    ? definePlugin({
        ...consoleDefinition,
        requires: [...(consoleDefinition.requires ?? []), state],
        setup(context) {
          ownedState = context.get(state);
          ownedAuthentication = context.get(local.authentication);
          return consoleDefinition.setup(context);
        },
      })
    : consoleDefinition;
  const mcp = administration
    ? definePlugin({
        id: "local-console-mcp",
        requires: [administration.plugin, administration.state],
        async setup(context) {
          const protocol = await administration.createMcp(context);
          context.onCleanup(protocol.close);
          return protocol;
        },
      })
    : undefined;
  const web = createWebPlugin({
    id: "console-web",
    requires: [
      consolePlugin,
      ...(administration
        ? [administration.plugin, administration.state, local.authentication]
        : []),
      ...(mcp ? [mcp] : []),
    ],
    // Bun's file responses and owner-built page assets can arrive as one chunk.
    maxChunkBytes: 8 * 1024 * 1024,
    router: () => ({}),
    fetch:
      (context) =>
      async ({ request }) => {
        if (administration && mcp) {
          if (new URL(request.url).pathname === administration.mcpPath) {
            return context.get(mcp).fetch(request);
          }
          const credential = await administration.credentialFetch(
            context.get(administration.state),
            context.get(administration.plugin),
            context.get(local.authentication),
            request
          );
          if (credential) {
            return credential;
          }
        }
        return context.get(consolePlugin).fetch(request);
      },
  });
  const listener = createBunListenerPlugin({
    id: "console-listener",
    web,
    hostname: "127.0.0.1",
    port: Number(new URL(config.origin).port),
    ingress(request) {
      // MCP owns exact URL/Host/Origin and Bearer verification. Cookie Console
      // ingress remains unchanged, including same-origin CSRF on credential POSTs.
      if (
        administration &&
        new URL(request.url).pathname === administration.mcpPath
      ) {
        return undefined;
      }
      try {
        requireConsoleRequest(request, local.requestPolicy);
        return undefined;
      } catch (error) {
        return consoleRequestErrorResponse(error, request.signal);
      }
    },
  });
  return {
    app: defineApp({
      plugins: [
        ...(state ? [state] : []),
        local.source,
        local.authentication,
        ...(administration
          ? [administration.plugin]
          : [inspection, authorization.plugin]),
        locale,
        ...(runtime ? [runtime.runtime, runtime.inspection.plugin] : []),
        consolePlugin,
        ...(mcp ? [mcp] : []),
        web,
        listener,
      ],
    }),
    listener,
    web,
    consolePlugin,
    authentication: local.authentication,
    locale,
    runtime: runtime?.runtime,
    administration,
    state,
    source: local.source,
    mcp,
  };
}
