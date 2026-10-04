import { useWorkspace } from "./navigation";
import type { ReadRefreshPolicy } from "./read-refresh";

/** Cache-safe JSON DTOs only; credentials and one-time mutation results stay local. */
export type ReadValue =
  | null
  | boolean
  | number
  | string
  | readonly ReadValue[]
  | { readonly [key: string]: ReadValue };

export type ReadSnapshot<Value> = Value extends readonly (infer Item)[]
  ? readonly ReadSnapshot<Item>[]
  : Value extends object
    ? { readonly [Field in keyof Value]: ReadSnapshot<Value[Field]> }
    : Value;

export interface WorkspaceReadOptions<Params, Data> {
  /** A stable business read name, never a URL, credential or security scope. */
  key: string;
  /** Every input affecting the returned data belongs here. */
  params: Params;
  read(context: { params: Params; signal: AbortSignal }): Promise<Data>;
  policy?: ReadRefreshPolicy;
}

export interface WorkspaceReadResult<Data> {
  data: ReadSnapshot<Data> | undefined;
  error: Error | null;
  blocking: boolean;
  refreshing: boolean;
  refetch(): Promise<void>;
}

/** Injected by Console; exposes no global cache or mutation authority. */
export interface WorkspaceReads {
  useRead<Params, Data>(
    options: WorkspaceReadOptions<Params, Data>
  ): WorkspaceReadResult<Data>;
  /** Call after a successful write ACK; omitted params select this read's variants. */
  invalidate(selector: { key: string; params?: unknown }): Promise<void>;
}

export type WorkspaceReadClient = Pick<WorkspaceReads, "invalidate">;

function useScopedReadsRuntime(): WorkspaceReads {
  const { reads } = useWorkspace();
  if (!reads) {
    throw new Error("This Console Host does not support scoped reads");
  }
  return reads;
}

/** Only the current authenticated mount's read invalidation authority. */
export function useWorkspaceReadClient(): WorkspaceReadClient {
  return useScopedReadsRuntime();
}

export function useWorkspaceRead<Params, Data>(
  options: WorkspaceReadOptions<Params, Data>
): WorkspaceReadResult<Data> {
  return useScopedReadsRuntime().useRead(options);
}

/** Freeze cache data rather than allowing form drafts to mutate a shared read. */
export function freezeReadSnapshot<Value>(value: Value): ReadSnapshot<Value> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeReadSnapshot(child);
    }
    Object.freeze(value);
  }
  return value as ReadSnapshot<Value>;
}

export function snapshotReadValue<Value>(value: Value): Value {
  const snapshot = structuredClone(value);
  freezeReadSnapshot(snapshot);
  return snapshot;
}
