import type { ConsoleAuthentication } from "@lenso/console";
import { ConsoleRequestError } from "@lenso/console/auth";
import {
  enforceConsoleSecurityInvocation,
  type ConsoleSecurityInvocation,
} from "@lenso/console/authorization";
import { definePlugin, type Plugin } from "@lenso/core/plugin";
import { defineOperation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import type { RuntimeService } from "@lenso/runtime";
import { z } from "zod";

import { projectRuntimeSnapshot } from "./client";

export function createConsoleRuntimeInspection<Clients>(options: {
  id: string;
  runtime: Plugin<RuntimeService<Clients>>;
  authentication: Plugin<ConsoleAuthentication>;
  targetId: string;
  tenantId: string;
}) {
  const plugin = definePlugin({
    id: options.id,
    requires: [options.runtime, options.authentication],
    setup(context) {
      const auth = context.get(options.authentication);
      const runtime = context.get(options.runtime);
      async function enforce(evidence: ConsoleSecurityInvocation) {
        if (
          evidence.resource.targetId !== options.targetId ||
          evidence.resource.tenantId !== options.tenantId
        ) {
          throw new ConsoleRequestError("forbidden");
        }
        await enforceConsoleSecurityInvocation(
          auth,
          evidence,
          options.id,
          "status"
        );
        const current = await auth.authenticate(evidence.request);
        const session = await auth.session(current);
        if (
          current.actor.realmId !== evidence.identity.actor.realmId ||
          current.actor.subjectId !== evidence.identity.actor.subjectId ||
          current.actor.kind !== "user" ||
          !session.administrator
        ) {
          throw new ConsoleRequestError("forbidden");
        }
        await auth.enforce(current, evidence.resource);
      }
      return {
        async status(
          _input: Record<string, never>,
          trusted: { evidence: ConsoleSecurityInvocation }
        ) {
          await enforce(trusted.evidence);
          const snapshot = projectRuntimeSnapshot(
            await runtime.host.status({
              signal: trusted.evidence.request.signal,
            })
          );
          await enforce(trusted.evidence);
          return snapshot;
        },
      };
    },
  });
  const operations = [
    defineOperation({
      plugin,
      method: "status",
      input: z.strictObject({}),
      context: true,
      effect: "read",
      destructive: false,
      retry: "safe",
      cancellation: "cooperative",
      description: "Read host-selected Runtime instance and call metadata.",
    }),
  ];
  return { plugin, operations, manage: defineManage({ plugin, operations }) };
}
