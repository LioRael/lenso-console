import type {
  Operation,
  OperationBoundOptions,
} from "@lenso/engine/operations";
import { LimitError, type Limits } from "@lenso/limits";

import { ConsoleOperationError } from "../errors";
import type { ConsoleIdentity, ConsoleResource } from "../types";

export interface ConsoleLimitPolicy {
  readonly scope: {
    readonly instance: string;
    readonly tenant: string;
    readonly key: string;
  };
  readonly capacity: number;
  readonly quantity: number;
  readonly periodMs: number;
}

export interface ConsoleLeasePolicy {
  readonly scope: ConsoleLimitPolicy["scope"];
  readonly capacity: number;
  readonly quantity: number;
  readonly ttlMs: number;
}

export interface ConsoleLimitsPolicyInput {
  readonly operation: Operation;
  readonly resource: ConsoleResource;
  readonly identity: ConsoleIdentity;
}

export interface ConsoleLimitsBindingOptions {
  readonly limits: Limits;
  readonly policy: (
    input: ConsoleLimitsPolicyInput
  ) => ConsoleLimitPolicy | undefined;
  readonly kind?: "rate" | "quota";
  readonly binding: (
    operation: Operation,
    input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    resource: ConsoleResource
  ) =>
    | OperationBoundOptions<Operation>
    | Promise<OperationBoundOptions<Operation>>;
  readonly onAdmit?: (input: ConsoleLimitsPolicyInput) => Promise<void> | void;
}

function translateLimitError(error: unknown): never {
  if (error instanceof LimitError) {
    if (error.code === "denied") {
      throw new ConsoleOperationError("TOO_MANY_REQUESTS");
    }
    if (error.code === "backend-failure") {
      throw new ConsoleOperationError("SERVICE_UNAVAILABLE");
    }
  }
  throw error;
}

/** Composes counter admission around a host Console binding and trusted policy. */
export function createConsoleLimitsBinding(
  options: ConsoleLimitsBindingOptions
) {
  return async (
    operation: Operation,
    input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    resource: ConsoleResource
  ) => {
    const policyInput = { operation, resource, identity };
    await options.onAdmit?.(policyInput);
    const policy = options.policy(policyInput);
    if (policy) {
      try {
        const decision =
          options.kind === "quota"
            ? await options.limits.consumeQuota(policy)
            : await options.limits.consumeRate(policy);
        if (!decision.allowed) {
          throw new ConsoleOperationError(
            decision.reason === "backend-failure"
              ? "SERVICE_UNAVAILABLE"
              : "TOO_MANY_REQUESTS",
            decision.reason === "backend-failure" ||
              decision.retryAfter === null
              ? undefined
              : { retryAfterMs: decision.retryAfter }
          );
        }
      } catch (error) {
        translateLimitError(error);
      }
    }
    return options.binding(operation, input, request, identity, resource);
  };
}

/** Wrap actual service execution in a concurrency lease; never acquire in binding. */
export async function withConsoleLimitsLease<T>(
  limits: Limits,
  policy: ConsoleLeasePolicy | undefined,
  request: Request,
  execute: (context: { signal: AbortSignal }) => Promise<T>
): Promise<T> {
  if (!policy) {
    return execute({ signal: request.signal });
  }
  try {
    return await limits.withLease(policy, ({ signal }) => execute({ signal }), {
      signal: request.signal,
    });
  } catch (error) {
    translateLimitError(error);
  }
}

/** Optional route-scoped pre-auth guard. Do not mount globally by default. */
export function createConsoleLimitsPreAuthGuard(
  limits: Limits,
  policy: (request: Request) => ConsoleLimitPolicy | undefined
) {
  return async (request: Request): Promise<void> => {
    const input = policy(request);
    if (!input) {
      return;
    }
    try {
      const decision = await limits.consumeRate(input);
      if (!decision.allowed) {
        throw new ConsoleOperationError(
          decision.reason === "backend-failure"
            ? "SERVICE_UNAVAILABLE"
            : "TOO_MANY_REQUESTS",
          decision.reason === "backend-failure" || decision.retryAfter === null
            ? undefined
            : { retryAfterMs: decision.retryAfter }
        );
      }
    } catch (error) {
      translateLimitError(error);
    }
  };
}
