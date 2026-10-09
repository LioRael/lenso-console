import { ConsoleRequestError } from "../auth";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleResource,
} from "../types";

/** Supplied by the trusted binding, not parsed from business input. */
export interface ConsoleSecurityInvocation {
  readonly identity: ConsoleIdentity;
  readonly resource: ConsoleResource;
  readonly request: Request;
}

export async function enforceConsoleSecurityInvocation(
  auth: ConsoleAuthentication,
  invocation: ConsoleSecurityInvocation,
  pluginId: string,
  operation: string
): Promise<void> {
  invocation.request.signal.throwIfAborted();
  if (
    invocation.resource.action !== "invoke" ||
    invocation.resource.pluginId !== pluginId ||
    invocation.resource.operation !== operation
  ) {
    throw new ConsoleRequestError("forbidden");
  }
  await auth.enforce(invocation.identity, invocation.resource);
  invocation.request.signal.throwIfAborted();
}
