export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | JsonObject;
// oxlint-disable-next-line typescript/consistent-indexed-object-style -- A recursive JSON object needs an interface boundary; a Record alias is circular.
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface DashboardDocument {
  schemaVersion: 1;
  instances: Array<{
    id: string;
    definition: { bindingId: string; widgetId: string };
    configVersion: number;
    config: JsonObject;
  }>;
  placements: Array<{
    instanceId: string;
    column: number;
    row: number;
    width: number;
    height: number;
  }>;
}

export interface DashboardSnapshot {
  revision: string;
  document: DashboardDocument;
  /** The server redacts config and the UI must not load these renderers. */
  restrictedInstanceIds?: readonly string[];
}

export interface DashboardStore {
  read(options?: { signal?: AbortSignal }): Promise<DashboardSnapshot>;
  save(
    input: {
      expectedRevision: string;
      mutationId: string;
      document: DashboardDocument;
    },
    options?: { signal?: AbortSignal }
  ): Promise<DashboardSnapshot>;
}
