import {
  COMMON_ERROR_STATUS_MAP,
  createORPCClient,
  MalformedResponseError,
  ORPCError,
} from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { ConsoleClient, ConsolePageDescriptor } from "./protocol";
import type { WorkspaceServices } from "./service-types";

export type ConsoleClientOptions = Pick<
  ConstructorParameters<typeof RPCLink>[0],
  "origin" | "url" | "fetch" | "headers"
>;

/** Browser-safe Fetch transport; no retries are installed. */
export function createConsoleClient(
  options: ConsoleClientOptions = {}
): ConsoleClient {
  const browserOrigin =
    typeof globalThis.location === "object"
      ? globalThis.location.origin
      : undefined;
  return createORPCClient(
    new RPCLink({
      ...options,
      ...(options.origin === undefined && browserOrigin
        ? { origin: browserOrigin }
        : {}),
      url: options.url ?? "/api/console/v2/rpc",
    })
  );
}

export class WorkspaceServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    code: string,
    status: number,
    retryAfterMs?: number
  ) {
    super(message);
    this.name = "WorkspaceServiceError";
    this.code = code;
    this.status = status;
    if (retryAfterMs !== undefined) {
      this.retryAfterMs = retryAfterMs;
    }
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

/** Read-only transport projection; complete catalog DTOs remain schema-derived. */
export type ConsoleWorkspaceMount = Pick<
  ConsolePageDescriptor,
  "id" | "revision"
> & {
  owner: Pick<ConsolePageDescriptor["owner"], "instance">;
  implementationId?: ConsolePageDescriptor["implementationId"];
  requirements: readonly Pick<
    ConsolePageDescriptor["requirements"][number],
    "available" | "service_id" | "operations" | "streaming_operations"
  >[];
};

export interface ConsoleWorkspaceServicesOptions extends ConsoleClientOptions {
  mount: ConsoleWorkspaceMount;
  signal?: AbortSignal | undefined;
  expectedSubject?: string | undefined;
  onStreamError?:
    | ((error: unknown, signal: AbortSignal | undefined) => void)
    | undefined;
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
      try {
        init.signal?.throwIfAborted();
      } catch (error) {
        // A supplied Fetch may resolve after cancellation, before oRPC owns
        // the body. Do not leave that unclaimed stream open.
        await response.body?.cancel();
        throw error;
      }
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
    signal?: AbortSignal,
    streaming = false
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
    const declaredStream =
      requirement.streaming_operations?.includes(operation);
    if (streaming ? !declaredStream : declaredStream) {
      throw new WorkspaceServiceError(
        streaming
          ? `Workspace service ${service}/${operation} has no streaming declaration for mount ${mount.id}`
          : `Workspace service ${service}/${operation} requires subscribe`,
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
    subscribe<Request, Item>(
      service: string,
      operation: string,
      input: Request,
      callOptions?: { signal?: AbortSignal }
    ): AsyncIterable<Item> {
      // Async generators queue return behind a pending next; this wrapper must
      // cancel the oRPC iterator immediately even while a frame is stalled.
      return {
        [Symbol.asyncIterator]() {
          const controller = new AbortController();
          let upstream:
            | Awaited<ReturnType<typeof client.workspace.subscribe>>
            | undefined;
          let pending: Promise<void> | undefined;
          let returning: Promise<unknown> | undefined;
          let closed = false;
          let signal: AbortSignal | undefined;
          const release = async () => {
            if (upstream) {
              returning ??= upstream.return();
              await returning;
            }
          };
          const cancel = async () => {
            try {
              await release();
            } catch {
              // Cancellation must not replace the stream's terminal error.
            }
          };
          const start = () =>
            (pending ??= (async () => {
              signal = prepare(
                service,
                operation,
                input,
                AbortSignal.any([
                  controller.signal,
                  ...(callOptions?.signal ? [callOptions.signal] : []),
                ]),
                true
              );
              signal?.addEventListener("abort", cancel, { once: true });
              upstream = await client.workspace.subscribe(
                { mountId: mount.id, service, operation, input },
                { signal }
              );
              if (closed || signal?.aborted) {
                await release();
              }
              signal?.throwIfAborted();
            })());
          return {
            async next(): Promise<IteratorResult<Item>> {
              if (closed) {
                return { done: true, value: undefined };
              }
              try {
                await start();
                const result = await upstream!.next();
                signal?.throwIfAborted();
                if (result.done) {
                  closed = true;
                  signal?.removeEventListener("abort", cancel);
                  return { done: true, value: undefined };
                }
                return { done: false, value: result.value as Item };
              } catch (error) {
                closed = true;
                await cancel();
                signal?.removeEventListener("abort", cancel);
                signal?.throwIfAborted();
                const mapped = mapWorkspaceError(error, service, operation);
                options.onStreamError?.(mapped, signal);
                throw mapped;
              }
            },
            async return(): Promise<IteratorResult<Item>> {
              closed = true;
              controller.abort();
              await release();
              signal?.removeEventListener("abort", cancel);
              return { done: true, value: undefined };
            },
          };
        },
      };
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
  const estimate =
    error.code === "TOO_MANY_REQUESTS" &&
    error.data &&
    typeof error.data === "object"
      ? Reflect.get(error.data, "retryAfterMs")
      : undefined;
  const retryAfterMs =
    typeof estimate === "number" &&
    Number.isFinite(estimate) &&
    estimate >= 0 &&
    estimate <= Number.MAX_SAFE_INTEGER
      ? estimate
      : undefined;
  return new WorkspaceServiceError(
    `Workspace service ${service}/${operation}: ${error.code}`,
    error.code,
    typeof status === "number" ? status : 503,
    retryAfterMs
  );
}
