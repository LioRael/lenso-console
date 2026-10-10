import type {
  WorkspaceServices,
  DeclaredOperation,
  DeclaredStreamOperation,
  ServiceDefinitions,
} from "./service-types";

export type {
  WorkspaceServices,
  DeclaredOperation,
  DeclaredStreamOperation,
  ServiceDefinitions,
} from "./service-types";

export type ServiceClient<Definitions extends ServiceDefinitions> = {
  readonly [Service in keyof Definitions]: {
    readonly [Name in keyof Definitions[Service]["operations"]]: Definitions[Service]["operations"][Name] extends DeclaredOperation<
      infer Input,
      infer Output
    >
      ? (input: Input, options?: { signal?: AbortSignal }) => Promise<Output>
      : Definitions[Service]["operations"][Name] extends DeclaredStreamOperation<
            infer Input,
            infer Item
          >
        ? {
            subscribe(
              input: Input,
              options?: { signal?: AbortSignal }
            ): AsyncIterable<Item>;
          }
        : never;
  };
};

/** Typed projection only. The mount transport still admits every operation. */
export function createClient<Definitions extends ServiceDefinitions>(
  transport: WorkspaceServices
): ServiceClient<Definitions> {
  const services = new Map<string, unknown>();
  return new Proxy(Object.create(null), {
    get(_target, service) {
      if (typeof service !== "string" || service === "then") {
        return undefined;
      }
      if (!services.has(service)) {
        services.set(
          service,
          new Proxy(Object.create(null), {
            get(_methods, operation) {
              if (typeof operation !== "string" || operation === "then") {
                return undefined;
              }
              return Object.assign(
                (input: unknown, options?: { signal?: AbortSignal }) =>
                  transport.invoke(service, operation, input, options),
                {
                  subscribe: (
                    input: unknown,
                    options?: { signal?: AbortSignal }
                  ) => transport.subscribe(service, operation, input, options),
                }
              );
            },
          })
        );
      }
      return services.get(service);
    },
  }) as ServiceClient<Definitions>;
}
