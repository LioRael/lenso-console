import type { AuthConsoleClient, SessionDTO } from "@lenso/auth-console/react";
import type {
  DashboardDocument,
  DashboardStore,
} from "@lenso/console-dashboard";
import type { ConsoleClient } from "@lenso/console-sdk/protocol";

import type { OrdersClient } from "./composition";

const check = (options?: { signal?: AbortSignal | undefined }) =>
  options?.signal?.throwIfAborted();

export function createSampleAuth(realm: string): AuthConsoleClient {
  const now = Date.now();
  const sessions: SessionDTO[] = [1, 2, 3].map((index) => ({
    id: `sample-${realm}-${index}`,
    realmId: `sample-${realm}`,
    subjectId: `sample-subject-${index}`,
    createdAt: now - index * 60_000,
    expiresAt: now + 86_400_000,
    revision: 1,
  }));
  return {
    capabilities: {
      info: true,
      sessionList: true,
      sessionDetail: true,
      sessionRevoke: true,
      subjects: true,
    },
    async info(options) {
      check(options);
      return {
        realm: `Sample ${realm}`,
        source: "Local in-memory sample client (no Auth server)",
        policy: "Preview only. This does not authenticate or authorize anyone.",
      };
    },
    async listSessionPage(input, options) {
      check(options);
      const start = input.cursor === undefined ? 0 : Number(input.cursor);
      if (!Number.isInteger(start) || start < 0) {
        throw new Error("Invalid sample cursor");
      }
      const end = start + Math.min(input.limit ?? 2, 2);
      return {
        sessions: structuredClone(sessions.slice(start, end)),
        nextCursor: end < sessions.length ? String(end) : null,
      };
    },
    async readSession(id, options) {
      check(options);
      return structuredClone(
        sessions.find((session) => session.id === id) ?? null
      );
    },
    async revokeSession(id, options) {
      check(options);
      const index = sessions.findIndex((session) => session.id === id);
      const session = sessions[index];
      if (!session || session.revokedAt !== undefined) {
        return { revoked: false };
      }
      if (options?.expectedRevision !== session.revision) {
        throw new Error("Sample session revision conflict");
      }
      sessions[index] = {
        ...session,
        revision: (session.revision ?? 0) + 1,
        revokedAt: Date.now(),
      };
      return { revoked: true };
    },
    async listSubjects(options) {
      check(options);
      return sessions.map((session) => ({
        realmId: session.realmId,
        subjectId: session.subjectId,
        label: `Sample subject ${session.subjectId}`,
      }));
    },
  };
}

export function createSampleDashboard(): DashboardStore {
  let revision = 1;
  let document: DashboardDocument = {
    schemaVersion: 1,
    instances: [
      {
        id: "sample-auth-information",
        definition: { bindingId: "auth.workforce", widgetId: "information" },
        configVersion: 1,
        config: {},
      },
    ],
    placements: [
      {
        instanceId: "sample-auth-information",
        column: 0,
        row: 0,
        width: 4,
        height: 3,
      },
    ],
  };
  const snapshot = () => ({
    revision: String(revision),
    document: structuredClone(document),
  });
  return {
    async read(options) {
      check(options);
      return snapshot();
    },
    async save(input, options) {
      check(options);
      if (input.expectedRevision !== String(revision)) {
        throw new Error("Sample dashboard revision conflict");
      }
      document = structuredClone(input.document);
      revision += 1;
      return snapshot();
    },
  };
}

export function createSampleOrders(): OrdersClient {
  let rows = [1, 2, 3].map((index) => ({
    id: `sample-order-${index}`,
    status: "Sample: ready",
  }));
  return {
    async list(options) {
      check(options);
      return structuredClone(rows);
    },
    async archive(input, options) {
      check(options);
      rows = rows.map((row) =>
        input.ids.includes(row.id)
          ? { ...row, status: "Sample: archived" }
          : row
      );
    },
  };
}

const unsupported = async (): Promise<never> => {
  throw new Error("This local sample preview has no operation transport.");
};

export const sampleCatalog: ConsoleClient = {
  async targets(_input, options) {
    check(options);
    return {
      schemaVersion: 1,
      targets: [{ id: "sample-local", label: "Sample local application" }],
    };
  },
  async plugins(_input, options) {
    check(options);
    return {
      schemaVersion: 1,
      plugins: ["sample-dashboard", "sample-auth", "sample-orders"].map(
        (id) => ({
          id,
          targetId: "sample-local",
          configuration: {
            state: "resolved",
            writable: false,
            fields: [],
            sources: [{ id: "sample-memory", kind: "local preview fixture" }],
          },
        })
      ),
    };
  },
  async catalog(_input, options) {
    check(options);
    return { schemaVersion: 1, revision: "sample-1", operations: [] };
  },
  invoke: unsupported,
  workspace: { invoke: unsupported, subscribe: unsupported },
};
