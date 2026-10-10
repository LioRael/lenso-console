import type { ConsolePageDescriptor } from "./protocol";

/** A browser-local alias admitted by the owning service and transport. */
export interface WorkspaceServices {
  invoke<Request = unknown, Response = unknown>(
    service: string,
    operation: string,
    input: Request,
    options?: { signal?: AbortSignal }
  ): Promise<Response>;
  subscribe<Request = unknown, Item = unknown>(
    service: string,
    operation: string,
    input: Request,
    options?: { signal?: AbortSignal }
  ): AsyncIterable<Item>;
}

/** Supplied by the trusted Host binding, never reconstructed from business input. */
export interface WorkspaceOperationContext {
  subject: ConsolePageDescriptor["subject"];
  owner: { instance: string };
  mountId: string;
  revision: string;
  signal: AbortSignal;
}

export interface DeclaredOperation<Input = unknown, Output = unknown> {
  readonly interaction: "request";
  readonly description?: string;
  readonly effect?: "read" | "write" | "unknown";
  readonly __types?: { input: Input; output: Output };
  invoke(context: WorkspaceOperationContext, value: unknown): Promise<Output>;
}
export interface DeclaredStreamOperation<Input = unknown, Item = unknown> {
  readonly interaction: "stream";
  readonly description?: string;
  readonly effect: "read";
  readonly __types?: { input: Input; output: Item };
  subscribe(
    context: WorkspaceOperationContext,
    value: unknown
  ): AsyncIterable<Item>;
}

export interface Service {
  capabilityId: string;
  version: string;
  operations: Readonly<
    Record<string, DeclaredOperation | DeclaredStreamOperation>
  >;
}
export type ServiceDefinitions = Readonly<Record<string, Service>>;
