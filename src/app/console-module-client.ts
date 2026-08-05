import {
  ConsoleHostError,
  type ConsoleClient,
  type ConsoleCommandOperation,
  type ConsoleQueryOperation,
  type ConsoleSha256Digest,
} from "@lenso/console-module-api";

import { httpClient } from "../lib/http-client";

type AdminRecordsResponse = {
  data: Record<string, unknown>[];
  page: { limit: number; next_cursor: string | null };
};

type ConsoleModuleClientOptions = {
  moduleId: string;
  moduleReleaseDigest: ConsoleSha256Digest;
  uiArtifactDigest: ConsoleSha256Digest;
  capabilities: readonly string[];
  requiredCapabilities?: readonly string[] | undefined;
  navigate: (path: string, options?: { replace?: boolean }) => void;
};

export function createConsoleModuleClient({
  capabilities,
  moduleId,
  moduleReleaseDigest,
  navigate,
  requiredCapabilities = [],
  uiArtifactDigest,
}: ConsoleModuleClientOptions): ConsoleClient {
  const available = new Set(capabilities);
  const required = new Set(requiredCapabilities);
  const assertCapabilities = () => {
    const missing = [...required].filter(
      (capability) => !available.has(capability)
    );
    if (missing.length > 0) {
      throw new ConsoleHostError(
        "capability_denied",
        `Console Module is missing required capabilities: ${missing.join(", ")}`,
        { status: 403 }
      );
    }
  };

  return {
    identity: { moduleId, moduleReleaseDigest, uiArtifactDigest },
    capabilities: {
      has: (capability) => available.has(capability),
      list: () => capabilities,
    },
    async query<Result>(
      operation: ConsoleQueryOperation<Result>
    ): Promise<Result> {
      assertCapabilities();
      if (operation.name !== "admin.records.list") {
        throw new ConsoleHostError(
          "not_found",
          `Console query operation is not supported: ${operation.name}`,
          { status: 404 }
        );
      }
      const { input } = operation;
      if (!input || typeof input !== "object" || !("entity" in input)) {
        throw new ConsoleHostError(
          "invalid_request",
          "admin.records.list requires an entity",
          { status: 400 }
        );
      }
      const query = input as {
        entity: string;
        limit?: number;
        cursor?: string;
      };
      if (!query.entity.trim()) {
        throw new ConsoleHostError(
          "invalid_request",
          "admin.records.list requires a non-empty entity",
          { status: 400 }
        );
      }
      const search = new URLSearchParams();
      if (query.limit !== undefined) {
        search.set("limit", String(query.limit));
      }
      if (query.cursor) {
        search.set("cursor", query.cursor);
      }
      const suffix = search.toString();
      const response = await httpClient
        .get(
          `admin/data/${encodeURIComponent(moduleId)}/${encodeURIComponent(query.entity)}${suffix ? `?${suffix}` : ""}`
        )
        .json<AdminRecordsResponse>();
      return {
        data: response.data,
        page: {
          limit: response.page.limit,
          nextCursor: response.page.next_cursor,
        },
      } as Result;
    },
    async command<Input, Result>(
      operation: ConsoleCommandOperation<Input, Result>,
      options?: { idempotencyKey?: string }
    ): Promise<Result> {
      assertCapabilities();
      const response = await httpClient
        .post(
          `admin/data/${encodeURIComponent(moduleId)}/actions/${encodeURIComponent(operation.name)}`,
          {
            json: { input: operation.input },
            ...(options?.idempotencyKey
              ? { headers: { "Idempotency-Key": options.idempotencyKey } }
              : {}),
          }
        )
        .json<Result>();
      return response;
    },
    navigate,
  };
}
