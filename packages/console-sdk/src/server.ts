import type {
  InvocationContext,
  WorkspaceServiceProvider,
  InvokeResult,
} from "./generated/workspace-service";

export interface Operation<Input = unknown, Output = unknown> {
  parse(value: unknown): Input;
  authorize(
    context: InvocationContext,
    input: Input
  ): boolean | Promise<boolean>;
  handle(input: Input, context: InvocationContext): Output | Promise<Output>;
}
interface ErasedOperation {
  invoke(context: InvocationContext, value: unknown): Promise<InvokeResult>;
}
const failure = (
  error:
    | "denied"
    | "codec_mismatch"
    | "unknown_operation"
    | "unknown_service"
    | "request_too_large"
    | "response_too_large"
): InvokeResult => ({ ok: false, error: { kind: "domain", error } });
/** Validation and final authorization are mandatory and owned by the Plugin. */
export function operation<Input, Output>(
  declaration: Operation<Input, Output>
): ErasedOperation {
  return {
    async invoke(context, value) {
      let input: Input;
      try {
        input = declaration.parse(value);
      } catch {
        return failure("codec_mismatch");
      }
      if ((await declaration.authorize(context, input)) !== true) {
        return failure("denied");
      }
      const json = JSON.stringify(await declaration.handle(input, context));
      if (json === undefined) {
        return failure("codec_mismatch");
      }
      const bytes = new TextEncoder().encode(json);
      if (bytes.length > 1024 * 1024) {
        return failure("response_too_large");
      }
      return {
        ok: true,
        value: {
          outcome: "success",
          body_base64: btoa(
            Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("")
          ),
        },
      };
    },
  };
}
export interface Service {
  capabilityId: string;
  version: string;
  operations: Readonly<Record<string, ErasedOperation>>;
}
export function defineServices(services: Readonly<Record<string, Service>>) {
  if (Object.keys(services).length > 32) {
    throw new Error("Too many workspace services");
  }
  for (const [id, service] of Object.entries(services)) {
    if (
      !/^[a-z][a-z0-9._-]{0,63}$/.test(id) ||
      !service.capabilityId ||
      !service.version ||
      Object.keys(service.operations).length === 0
    ) {
      throw new Error("Invalid workspace service declaration");
    }
    for (const name of Object.keys(service.operations)) {
      if (!/^[a-z][a-z0-9._-]{0,63}$/.test(name)) {
        throw new Error("Invalid service operation");
      }
    }
  }
  return services;
}
export function createWorkspaceServices(
  services: ReturnType<typeof defineServices>,
  revision: string
) {
  const exports = Object.entries(services).map(([service_id, service]) => ({
    service_id,
    capability_id: service.capabilityId,
    descriptor_version: service.version,
    operations: Object.keys(service.operations).map((name) => ({
      name,
      interaction: "request" as const,
    })),
  }));
  const requirements = exports.map((service) => ({
    ...service,
    operations: service.operations.map((op) => op.name),
    required: true,
    source: "owner" as const,
  }));
  const provider: WorkspaceServiceProvider = {
    async describe_exports() {
      return {
        ok: true,
        value: { adapter_revision: revision, services: exports },
      };
    },
    async invoke(context, request) {
      if (request.media_type !== "application/json") {
        return failure("codec_mismatch");
      }
      if (!Object.hasOwn(services, request.service_id)) {
        return failure("unknown_service");
      }
      const { operations } = services[request.service_id];
      if (!Object.hasOwn(operations, request.operation)) {
        return failure("unknown_operation");
      }
      if (request.body_base64.length > 1_398_104) {
        return failure("request_too_large");
      }
      let value: unknown;
      try {
        value = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Uint8Array.from(
              atob(request.body_base64),
              (character) => character.codePointAt(0) ?? 0
            )
          )
        );
      } catch {
        return failure("codec_mismatch");
      }
      return operations[request.operation].invoke(context, value);
    },
    async subscribe() {
      return {
        ok: false,
        error: { kind: "domain", error: "unknown_operation" },
      };
    },
  };
  return { requirements, provider };
}
