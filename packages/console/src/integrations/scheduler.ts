import type { Actor } from "@lenso/auth";
import type { Plugin } from "@lenso/core";
import type { Operation } from "@lenso/engine/operations";
import type { Scheduler } from "@lenso/scheduler";
import { createSchedulerManage } from "@lenso/scheduler/manage";
import type { Task } from "@lenso/tasks";

import { ConsoleOperationError } from "../errors";
import { isSelectedOperation } from "../operation-selection";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleOptions,
  ConsoleResource,
} from "../types";
import type { ConsoleTaskContext } from "./tasks";

export interface ConsoleSchedulerOptions<A extends Actor> {
  readonly id: string;
  readonly scheduler: Plugin<Scheduler<A>>;
  readonly tasks: readonly Pick<Task, "name" | "input">[];
  readonly authentication: ConsoleAuthentication;
  /** Return an Auth-issued actor for the Scheduler audience, never a JSON actor or admin grant. */
  readonly resolve: (trusted: ConsoleTaskContext) => A | Promise<A>;
  readonly authorizeCatalog?: (actor: A, signal: AbortSignal) => Promise<void>;
}

/** Scheduler owns scope, per-schedule authorization and revision checks. No driver is started. */
export function createConsoleSchedulerIntegration<A extends Actor>(
  options: ConsoleSchedulerOptions<A>
) {
  const companion = createSchedulerManage({
    id: options.id,
    scheduler: options.scheduler,
    tasks: options.tasks,
    ...(options.authorizeCatalog
      ? { authorizeCatalog: options.authorizeCatalog }
      : {}),
  });
  const binding = async (
    operation: Operation,
    _input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    resource: ConsoleResource
  ) => {
    if (
      !isSelectedOperation(companion.operations, operation) ||
      resource.action !== "invoke" ||
      resource.pluginId !== companion.plugin.id ||
      resource.operation !== operation.method
    ) {
      throw new ConsoleOperationError("FORBIDDEN");
    }
    request.signal.throwIfAborted();
    await options.authentication.enforce(identity, resource);
    request.signal.throwIfAborted();
    const actor = await options.resolve({ identity, resource, request });
    await options.authentication.enforce(identity, resource);
    request.signal.throwIfAborted();
    return {
      context: { actor, signal: request.signal },
      signal: request.signal,
    };
  };
  return { ...companion, binding: binding satisfies ConsoleOptions["binding"] };
}
