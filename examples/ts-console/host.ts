import { createAuthorizationInspection } from "@lenso/authorization/manage";
import type { ConsoleIdentity } from "@lenso/console";
import { createConsolePlugin } from "@lenso/console";
import {
  consoleRequestErrorResponse,
  requireConsoleRequest,
} from "@lenso/console/auth";
import { createConsoleAuthorizationManage } from "@lenso/console/authorization";
import { defineApp, definePlugin } from "@lenso/core";
import { createWebPlugin } from "@lenso/web";
import { createBunListenerPlugin } from "@lenso/web/bun";

import { createAuthorizationMount } from "./authorization-mount";
import type { HostConfiguration } from "./configuration";
import {
  createLocalAuthentication,
  localScope,
  localTarget,
} from "./local-auth";
import { createLocalLocaleStore } from "./locale-store";
import { createBuiltShell } from "./shell";

export async function createHost(config: HostConfiguration) {
  const shell = await createBuiltShell(config.shellDirectory, config);
  const local = createLocalAuthentication(config);
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
  const consolePlugin = createConsolePlugin({
    authentication: local.authentication,
    apiBasePath: config.apiBasePath,
    authBasePath: config.authBasePath,
    management: true,
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
        plugins: [authorization.plugin, locale],
        manage: [authorization.manage],
        mounts: [
          await createAuthorizationMount(authorization, config.apiBasePath),
        ],
      },
    ],
    binding: (_operation, _input, request, identity, resource) => ({
      context: { identity, resource, request },
      signal: request.signal,
    }),
    shellMatches: shell.matches,
    shell: shell.fetch,
  });
  const web = createWebPlugin({
    id: "console-web",
    requires: [consolePlugin],
    // Bun's file responses and owner-built page assets can arrive as one chunk.
    maxChunkBytes: 8 * 1024 * 1024,
    router: () => ({}),
    fetch:
      (context) =>
      ({ request }) =>
        context.get(consolePlugin).fetch(request),
  });
  const listener = createBunListenerPlugin({
    id: "console-listener",
    web,
    hostname: "127.0.0.1",
    port: Number(new URL(config.origin).port),
    ingress(request) {
      try {
        requireConsoleRequest(request, {
          origin: config.origin,
          credentialMode: "cookie",
        });
        return undefined;
      } catch (error) {
        return consoleRequestErrorResponse(error, request.signal);
      }
    },
  });
  return {
    app: defineApp({
      plugins: [
        local.source,
        local.authentication,
        inspection,
        authorization.plugin,
        locale,
        consolePlugin,
        web,
        listener,
      ],
    }),
    listener,
    web,
    consolePlugin,
    authentication: local.authentication,
    locale,
  };
}
