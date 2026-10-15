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

import {
  projectRuntimeSnapshot,
  runtimeCatalogueSchema,
  runtimeGreetingInputSchema,
  runtimeGreetingResultSchema,
  runtimeGreetingTargetSchema,
  runtimeInspectionLimits,
  type RuntimeGreetingInput,
} from "./client";
import { readRuntimeBuildManifest } from "./manifest";

export interface ConsoleRuntimeGreetingTrial {
  namespace: string;
  service: string;
  contractVersion: string;
  /** The application owner has reviewed this exact target's greet implementation. */
  sideEffectFree: true;
}

const greetingContract = {
  mode: "unary" as const,
  input: {
    type: "object" as const,
    properties: {
      name: {
        type: "string" as const,
        minLength: 1,
        maxLength: runtimeInspectionLimits.greetingName,
      },
    },
    required: ["name"],
    additionalProperties: false as const,
  },
  output: {
    type: "object" as const,
    properties: {
      message: {
        type: "string" as const,
        minLength: 1,
        maxLength: runtimeInspectionLimits.greetingMessage,
      },
    },
    required: ["message"],
    additionalProperties: false as const,
  },
  error: { type: "null" as const },
};

const greetingErrors = {
  deadline_exceeded: "Runtime greeting trial timed out.",
  cancelled: "Runtime greeting trial was cancelled.",
  unavailable: "Runtime greeting trial is unavailable.",
  invalid_output: "Runtime greeting trial returned an invalid result.",
} as const;

class GreetingTrialError extends Error {
  readonly code: keyof typeof greetingErrors;
  constructor(code: keyof typeof greetingErrors) {
    super(greetingErrors[code]);
    this.code = code;
    this.name = "GreetingTrialError";
  }
}

function greetingFailureCode(error: unknown): keyof typeof greetingErrors {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  return code === "deadline_exceeded" || code === "cancelled"
    ? code
    : "unavailable";
}

export function createConsoleRuntimeInspection<Clients>(options: {
  id: string;
  runtime: Plugin<RuntimeService<Clients>>;
  authentication: Plugin<ConsoleAuthentication>;
  targetId: string;
  tenantId: string;
  /** Trusted, bounded build artifact loaded once when this plugin starts. */
  manifestPath?: string;
  /** Omitted by default. No browser-supplied target or method is accepted. */
  greetingTrial?: ConsoleRuntimeGreetingTrial;
}) {
  const trial =
    options.greetingTrial === undefined
      ? undefined
      : z
          .strictObject({
            ...runtimeGreetingTargetSchema.shape,
            sideEffectFree: z.literal(true),
          })
          .parse(options.greetingTrial);
  const target = trial
    ? runtimeGreetingTargetSchema.parse({
        namespace: trial.namespace,
        service: trial.service,
        contractVersion: trial.contractVersion,
      })
    : undefined;
  const plugin = definePlugin({
    id: options.id,
    requires: [options.runtime, options.authentication],
    async setup(context) {
      const auth = context.get(options.authentication);
      const runtime = context.get(options.runtime);
      const services =
        options.manifestPath === undefined
          ? []
          : await readRuntimeBuildManifest(options.manifestPath);
      if (
        target &&
        options.manifestPath !== undefined &&
        !services.some(
          (service) =>
            service.namespace === target.namespace &&
            service.service === target.service &&
            service.contract.version === target.contractVersion &&
            service.contract.methods.greet?.mode === "unary"
        )
      ) {
        throw new Error(
          "Runtime greeting trial must match a declared unary greet target."
        );
      }
      const catalogue = runtimeCatalogueSchema.parse({
        source: "static-build-manifest",
        availability: "unverified",
        configured: options.manifestPath !== undefined,
        services,
        greetingTrial: target
          ? {
              enabled: true,
              target,
              method: "greet",
              timeoutMs: runtimeInspectionLimits.greetingTimeoutMs,
            }
          : { enabled: false },
      });
      async function enforce(
        evidence: ConsoleSecurityInvocation,
        operation: string
      ) {
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
          operation
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
        evidence.request.signal.throwIfAborted();
      }
      return {
        async status(
          _input: Record<string, never>,
          trusted: { evidence: ConsoleSecurityInvocation }
        ) {
          await enforce(trusted.evidence, "status");
          const snapshot = projectRuntimeSnapshot(
            await runtime.host.status({
              signal: trusted.evidence.request.signal,
              timeoutMs: runtimeInspectionLimits.greetingTimeoutMs,
            })
          );
          await enforce(trusted.evidence, "status");
          return snapshot;
        },
        async catalogue(
          _input: Record<string, never>,
          trusted: { evidence: ConsoleSecurityInvocation }
        ) {
          await enforce(trusted.evidence, "catalogue");
          const result = structuredClone(catalogue);
          await enforce(trusted.evidence, "catalogue");
          return result;
        },
        async greet(
          input: RuntimeGreetingInput,
          trusted: { evidence: ConsoleSecurityInvocation }
        ) {
          await enforce(trusted.evidence, "greet");
          if (!target) {
            throw new ConsoleRequestError("forbidden");
          }
          const parsed = runtimeGreetingInputSchema.safeParse(input);
          if (!parsed.success) {
            throw new ConsoleRequestError("bad_request");
          }
          let output: unknown;
          let failure: keyof typeof greetingErrors | undefined;
          try {
            output = await runtime.host.call(target, "greet", parsed.data, {
              signal: trusted.evidence.request.signal,
              timeoutMs: runtimeInspectionLimits.greetingTimeoutMs,
              contract: structuredClone(greetingContract),
            });
          } catch (error) {
            failure = greetingFailureCode(error);
          }
          await enforce(trusted.evidence, "greet");
          if (failure) {
            throw new GreetingTrialError(failure);
          }
          const result = runtimeGreetingResultSchema.safeParse(output);
          if (!result.success) {
            throw new GreetingTrialError("invalid_output");
          }
          return result.data;
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
    defineOperation({
      plugin,
      method: "catalogue",
      input: z.strictObject({}),
      context: true,
      effect: "read",
      destructive: false,
      retry: "safe",
      cancellation: "cooperative",
      description:
        "Inspect static build contracts; declarations do not establish live availability.",
    }),
    ...(target
      ? [
          defineOperation({
            plugin,
            method: "greet",
            input: runtimeGreetingInputSchema,
            context: true,
            effect: "read",
            destructive: false,
            retry: "safe",
            cancellation: "cooperative",
            description:
              "Run the application-approved side-effect-free greeting trial on one fixed Runtime target.",
            mapError: (error) =>
              error instanceof GreetingTrialError
                ? {
                    code: error.code,
                    phase: "invoke",
                    message: error.message,
                  }
                : undefined,
          }),
        ]
      : []),
  ];
  return { plugin, operations, manage: defineManage({ plugin, operations }) };
}
