import {
  COMMON_ERROR_STATUS_MAP,
  createORPCClient,
  MalformedResponseError,
  ORPCError,
} from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { WorkspaceServices } from "./index";
import type { ConsoleClient } from "./protocol";

export type ConsoleClientOptions = Pick<
  ConstructorParameters<typeof RPCLink>[0],
  "origin" | "url" | "fetch" | "headers"
>;

/** Browser-safe Fetch transport; no retries are installed. */
export function createConsoleClient(
  options: ConsoleClientOptions = {}
): ConsoleClient {
  return createORPCClient(
    new RPCLink({
      ...options,
      url: options.url ?? "/api/console/v2/rpc",
    })
  );
}

export class WorkspaceServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "WorkspaceServiceError";
    this.code = code;
    this.status = status;
  }
}

export class WorkspaceServiceDomainError extends WorkspaceServiceError {
  readonly payload: unknown;

  constructor(payload: unknown, service: string, operation: string) {
    super(
      `Workspace service ${service}/${operation} returned a domain error`,
      "workspace_service_domain_error",
      422
    );
    this.name = "WorkspaceServiceDomainError";
    this.payload = payload;
  }
}

export interface ConsoleWorkspaceMount {
  id: string;
  owner: { instance: string };
  revision: string;
  implementationId?: string;
  requirements: readonly {
    available: boolean;
    service_id: string;
    operations: readonly string[];
  }[];
}

export interface ConsoleWorkspaceServicesOptions extends ConsoleClientOptions {
  mount: ConsoleWorkspaceMount;
  signal?: AbortSignal | undefined;
  expectedSubject?: string | undefined;
}

/** Cancellation discards late results. It cannot roll back a dispatched write. */
export function createConsoleWorkspaceServices(
  options: ConsoleWorkspaceServicesOptions
): WorkspaceServices {
  const { mount } = options;
  const client = createConsoleClient({
    ...options,
    fetch: async (url, init, ...args) => {
      init.signal?.throwIfAborted();
      const response = await (options.fetch
        ? options.fetch(url, init, ...args)
        : globalThis.fetch(url, init));
      init.signal?.throwIfAborted();
      return response;
    },
    headers: async (...args) => {
      const supplied =
        typeof options.headers === "function"
          ? await options.headers(...args)
          : options.headers;
      const headers =
        supplied instanceof Headers ? new Headers(supplied) : new Headers();
      if (supplied && !(supplied instanceof Headers)) {
        for (const [name, values] of Object.entries(supplied)) {
          if (values !== undefined) {
            for (const value of Array.isArray(values) ? values : [values]) {
              headers.append(name, value);
            }
          }
        }
      }
      headers.set("x-lenso-page-owner", mount.owner.instance);
      headers.set("x-lenso-page-revision", mount.revision);
      if (mount.implementationId) {
        headers.set("x-lenso-page-implementation", mount.implementationId);
      }
      if (options.expectedSubject) {
        headers.set("x-lenso-expected-subject", options.expectedSubject);
      }
      return headers;
    },
  });
  const prepare = (
    service: string,
    operation: string,
    input: unknown,
    signal?: AbortSignal
  ) => {
    const signals = [options.signal, signal].filter(
      (value): value is AbortSignal => !!value
    );
    const combined = signals.length ? AbortSignal.any(signals) : undefined;
    combined?.throwIfAborted();
    const requirement = mount.requirements.find(
      (candidate) => candidate.service_id === service
    );
    if (
      !requirement?.available ||
      !requirement.operations.includes(operation)
    ) {
      throw new WorkspaceServiceError(
        `Workspace service ${service}/${operation} is not admitted for mount ${mount.id}`,
        "workspace_service_unavailable",
        503
      );
    }
    if (
      new TextEncoder().encode(JSON.stringify(input)).byteLength >
      1024 * 1024
    ) {
      throw new WorkspaceServiceError(
        "Workspace service request exceeds one MiB",
        "workspace_service_request_too_large",
        413
      );
    }
    return combined;
  };
  return {
    async invoke<Request, Response>(
      service: string,
      operation: string,
      input: Request,
      callOptions?: { signal?: AbortSignal }
    ) {
      const signal = prepare(service, operation, input, callOptions?.signal);
      try {
        const result = await client.workspace.invoke(
          {
            mountId: mount.id,
            service,
            operation,
            input,
          },
          { signal }
        );
        signal?.throwIfAborted();
        return result as Response;
      } catch (error) {
        signal?.throwIfAborted();
        throw mapWorkspaceError(error, service, operation);
      }
    },
    async *subscribe<Request, Item>(
      service: string,
      operation: string,
      input: Request,
      callOptions?: { signal?: AbortSignal }
    ): AsyncIterable<Item> {
      prepare(service, operation, input, callOptions?.signal);
      yield* [] as Item[];
      throw new WorkspaceServiceError(
        "Console v2 Manage does not support workspace service streaming",
        "workspace_service_streaming_unsupported",
        501
      );
    },
  };
}

function mapWorkspaceError(
  error: unknown,
  service: string,
  operation: string
): unknown {
  if (error instanceof SyntaxError || error instanceof MalformedResponseError) {
    return new WorkspaceServiceError(
      "Workspace service returned a malformed response",
      "workspace_service_protocol_error",
      502
    );
  }
  if (!(error instanceof ORPCError)) {
    return error;
  }
  if (error.code === "WORKSPACE_SERVICE_DOMAIN_ERROR") {
    const data = error.data as { payload?: unknown } | undefined;
    return new WorkspaceServiceDomainError(data?.payload, service, operation);
  }
  if (error.code === "WORKSPACE_SERVICE_ERROR") {
    const data = error.data as { code?: unknown; status?: unknown } | undefined;
    if (
      typeof data?.code === "string" &&
      typeof data.status === "number" &&
      Number.isInteger(data.status) &&
      data.status >= 400 &&
      data.status <= 599
    ) {
      return new WorkspaceServiceError(
        `Workspace service ${service}/${operation}: ${data.code}`,
        data.code,
        data.status
      );
    }
  }
  if (error.code === "MALFORMED_ORPC_RESPONSE") {
    return new WorkspaceServiceError(
      "Workspace service returned a malformed response",
      "workspace_service_protocol_error",
      502
    );
  }
  const status = Object.hasOwn(COMMON_ERROR_STATUS_MAP, error.code)
    ? Reflect.get(COMMON_ERROR_STATUS_MAP, error.code)
    : undefined;
  return new WorkspaceServiceError(
    `Workspace service ${service}/${operation}: ${error.code}`,
    error.code,
    typeof status === "number" ? status : 503
  );
}
