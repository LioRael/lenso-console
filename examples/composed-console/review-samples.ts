import {
  administrationActions,
  matchesDirectoryFilter,
  type AccessSnapshot,
  type AdministrationClient,
  type AdministrationInputs,
  type AdministrationMethod,
  type AdministrationOutputs,
  type AdministrationSession,
  type ConsoleRole,
  type DirectoryUser,
  type ManagementEvent,
  type Member,
  type Page,
  type PageInput,
  type PersonalToken,
} from "@lenso/auth-console/client";
import type {
  OAuthConnectedApplication,
  OAuthConsoleClient,
} from "@lenso/auth-console/oauth/client";
import type {
  RuntimeCatalogue,
  RuntimeSnapshot,
} from "@lenso/console-runtime/client";
import type { WorkspaceServices } from "@lenso/console-sdk";

const realmId = "sample-directory";
const consoleId = "sample-console";
const tenantId = "sample-tenant";
export const sampleOperator = "sample-operator";
const day = 86_400_000;

function checkRevision(expected: string | number, current: string | number) {
  if (String(expected) !== String(current)) {
    throw Object.assign(new Error("Sample revision conflict"), {
      code: "CONFLICT",
    });
  }
}

function page<T>(items: readonly T[], input: PageInput): Page<T> {
  const start = Number(input.cursor ?? 0);
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new Error("Invalid sample cursor");
  }
  const end = start + Math.max(1, Math.min(input.limit ?? 2, 100));
  return structuredClone({
    items: items.slice(start, end),
    nextCursor: end < items.length ? String(end) : null,
  });
}

export function createReviewAdministration(): AdministrationClient {
  const now = Date.now();
  let revision = 1;
  let users: DirectoryUser[] = [
    { subjectId: sampleOperator, label: "Sample operator", status: "active" },
    { subjectId: "sample-editor", label: "Sample editor", status: "active" },
    { subjectId: "sample-viewer", label: "Sample viewer", status: "disabled" },
  ].map((user) => ({
    ...user,
    realmId,
    source: "In-memory sample directory",
    status: user.status as DirectoryUser["status"],
  }));
  let roles: ConsoleRole[] = [
    {
      id: "instance-owner",
      label: "Sample owner",
      permissions: administrationActions,
      preset: true,
    },
    {
      id: "viewer",
      label: "Sample viewer",
      permissions: [
        "users.list",
        "users.read",
        "members.list",
        "roles.list",
        "permissions.read",
      ],
      preset: true,
    },
    {
      id: "sample-editor",
      label: "Sample editor",
      permissions: [
        "users.list",
        "users.read",
        "sessions.list",
        "sessions.revoke",
      ],
      preset: false,
    },
  ];
  let members: Member[] = [
    {
      subjectId: sampleOperator,
      realmId,
      roleId: "instance-owner",
      status: "active",
    },
    {
      subjectId: "sample-editor",
      realmId,
      roleId: "sample-editor",
      status: "active",
    },
  ];
  let sessions: AdministrationSession[] = users.flatMap((user) =>
    [1, 2].map((index) => ({
      id: `${user.subjectId}-session-${index}`,
      subjectId: user.subjectId,
      createdAt: now - index * day,
      expiresAt: now + day,
      revision: 1,
    }))
  );
  let tokens: PersonalToken[] = [
    {
      id: "sample-token",
      subjectId: sampleOperator,
      consoleId,
      tenantId,
      scopes: ["users.list", "users.read"],
      issuedAt: now,
      expiresAt: now + 7 * day,
      revokedAt: null,
      revision: 1,
      overlapUntil: null,
    },
  ];
  const events: ManagementEvent[] = [
    {
      id: "sample-event",
      occurredAt: now,
      action: "sample.tokens.issue",
      subjectId: sampleOperator,
      result: "Sample fixture, not a recorded server event",
      targetId: "sample-token",
    },
  ];
  const requests = new Map<string, PersonalToken>();
  const snapshot = (): AccessSnapshot =>
    structuredClone({
      revision: String(revision),
      consoleId,
      tenantId,
      members,
      roles,
    });
  const record = (action: string, targetId: string) => {
    const id = crypto.randomUUID();
    events.unshift({
      id,
      occurredAt: Date.now(),
      action: `sample.${action}`,
      subjectId: sampleOperator,
      result: "Sample change (browser memory only)",
      targetId,
    });
    return id;
  };
  const setMember = (input: AdministrationInputs["membersSet"]) => {
    checkRevision(input.expectedRevision, revision);
    if (
      !users.some(
        (user) => user.subjectId === input.subjectId && user.status === "active"
      ) ||
      !roles.some((role) => role.id === input.roleId)
    ) {
      throw new Error(
        "Choose an active sample user and an existing sample role"
      );
    }
    if (
      input.subjectId === sampleOperator &&
      input.roleId !== "instance-owner"
    ) {
      throw new Error("Keep the sample instance owner available");
    }
    members = [
      ...members.filter((member) => member.subjectId !== input.subjectId),
      {
        subjectId: input.subjectId,
        realmId,
        roleId: input.roleId,
        status: "active",
      },
    ];
    revision += 1;
    record("members.set", input.subjectId);
    return snapshot();
  };
  const handlers: {
    [M in AdministrationMethod]: (
      input: AdministrationInputs[M]
    ) => AdministrationOutputs[M];
  } = {
    info: () => ({
      consoleId,
      tenantId,
      realmId,
      source: "Sample preview. No Auth server or MCP endpoint is connected.",
      mcpUrl: "https://sample.invalid/mcp",
      allowed: administrationActions,
      supported: {
        userDisable: true,
        userStatusFilter: true,
        userNameFilter: true,
        userFilterGroups: true,
        sessions: true,
        sessionRevoke: true,
      },
      authentication: "personal-token",
      observedLastCallAt: null,
    }),
    usersList: (input) =>
      page(
        users.filter(
          (user) =>
            (!input.search ||
              `${user.label} ${user.subjectId}`
                .toLowerCase()
                .includes(input.search.toLowerCase())) &&
            (!input.status || user.status === input.status) &&
            (!input.name ||
              (input.name.operator === "equals"
                ? user.label === input.name.value
                : user.label
                    .toLowerCase()
                    .includes(input.name.value.toLowerCase()))) &&
            (!input.filter || matchesDirectoryFilter(input.filter, user))
        ),
        input
      ),
    usersRead: ({ subjectId }) =>
      users.find((user) => user.subjectId === subjectId) ?? null,
    usersDisable: (input) => {
      checkRevision(input.expectedRevision, revision);
      if (input.subjectId === sampleOperator) {
        throw new Error("Keep the sample instance owner available");
      }
      const changed = users.some(
        (user) => user.subjectId === input.subjectId && user.status === "active"
      );
      users = users.map((user) =>
        user.subjectId === input.subjectId
          ? { ...user, status: "disabled" }
          : user
      );
      revision += 1;
      return { changed, intentId: record("users.disable", input.subjectId) };
    },
    sessionsList: (input) =>
      page(
        sessions.filter((session) => session.subjectId === input.subjectId),
        input
      ),
    sessionsRevoke: (input) => {
      const session = sessions.find(
        (item) => item.id === input.id && item.subjectId === input.subjectId
      );
      if (!session) {
        throw new Error("Sample session not found");
      }
      checkRevision(input.expectedRevision, session.revision);
      sessions = sessions.map((item) =>
        item === session
          ? { ...item, revokedAt: Date.now(), revision: item.revision + 1 }
          : item
      );
      return { revoked: true, intentId: record("sessions.revoke", input.id) };
    },
    accessRead: snapshot,
    membersSet: setMember,
    membersPromote: setMember,
    membersRevoke: (input) => {
      checkRevision(input.expectedRevision, revision);
      if (input.subjectId === sampleOperator) {
        throw new Error("Keep the sample instance owner available");
      }
      members = members.map((member) =>
        member.subjectId === input.subjectId
          ? { ...member, status: "revoked" }
          : member
      );
      revision += 1;
      record("members.revoke", input.subjectId);
      return snapshot();
    },
    rolesSave: (input) => {
      checkRevision(input.expectedRevision, revision);
      if (roles.some((role) => role.id === input.id && role.preset)) {
        throw new Error("Sample preset roles are read-only");
      }
      roles = [
        ...roles.filter((role) => role.id !== input.id),
        {
          id: input.id,
          label: input.label,
          permissions: [...input.permissions],
          preset: false,
        },
      ];
      revision += 1;
      record("roles.save", input.id);
      return snapshot();
    },
    permissionsRead: ({ subjectId }) => {
      const member = members.find(
        (item) => item.subjectId === subjectId && item.status === "active"
      );
      const role = roles.find((item) => item.id === member?.roleId);
      return {
        subjectId,
        revision: String(revision),
        allowed: role?.permissions ?? [],
        sources: role
          ? [{ roleId: role.id, permissions: role.permissions }]
          : [],
      };
    },
    tokensList: (input) => page(tokens, input),
    tokensRevoke: (input) => {
      const token = tokens.find((item) => item.id === input.id);
      if (!token) {
        throw new Error("Sample token not found");
      }
      checkRevision(input.expectedRevision, token.revision);
      tokens = tokens.map((item) =>
        item === token
          ? { ...item, revokedAt: Date.now(), revision: item.revision + 1 }
          : item
      );
      return { revoked: true, intentId: record("tokens.revoke", input.id) };
    },
    auditList: (input) => page(events, input),
  };
  return {
    async invoke<M extends AdministrationMethod>(
      method: M,
      input: AdministrationInputs[M],
      options?: { signal?: AbortSignal }
    ) {
      options?.signal?.throwIfAborted();
      return structuredClone(handlers[method](input));
    },
    async issueToken(input) {
      const previous = requests.get(input.requestId);
      if (previous) {
        return {
          token: structuredClone(previous),
          credential: null,
          replayed: true,
        };
      }
      const token: PersonalToken = {
        id: `sample-token-${crypto.randomUUID()}`,
        subjectId: sampleOperator,
        consoleId,
        tenantId,
        scopes: [...input.scopes],
        issuedAt: Date.now(),
        expiresAt: input.expiresAt,
        revokedAt: null,
        revision: 1,
        overlapUntil: null,
      };
      tokens = [token, ...tokens];
      requests.set(input.requestId, token);
      record("tokens.issue", token.id);
      return {
        token: structuredClone(token),
        credential: "SAMPLE_ONLY_NOT_A_VALID_CREDENTIAL",
        replayed: false,
      };
    },
    async rotateToken(input) {
      const previous = tokens.find(
        (token) => token.id === input.id && token.revokedAt === null
      );
      if (!previous) {
        throw new Error("Active sample token not found");
      }
      checkRevision(input.expectedRevision, previous.revision);
      const token = {
        ...previous,
        id: `sample-token-${crypto.randomUUID()}`,
        issuedAt: Date.now(),
        revision: 1,
      };
      tokens = [
        token,
        ...tokens.map((item) =>
          item === previous
            ? {
                ...item,
                revision: item.revision + 1,
                revokedAt: input.overlapMs === 0 ? Date.now() : null,
                overlapUntil:
                  input.overlapMs > 0 ? Date.now() + input.overlapMs : null,
              }
            : item
        ),
      ];
      record("tokens.rotate", previous.id);
      return {
        token: structuredClone(token),
        credential: "SAMPLE_ONLY_NOT_A_VALID_CREDENTIAL",
        replayed: false,
      };
    },
  };
}

export function createReviewOAuth(): OAuthConsoleClient {
  let grants: OAuthConnectedApplication[] = [
    {
      id: "sample-grant",
      clientId: "sample-client",
      clientName: "Sample application",
      subjectId: sampleOperator,
      resource: "https://sample.invalid/mcp",
      scopes: ["users.list", "users.read"],
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * day,
      revoked: false,
    },
  ];
  return {
    async consent(requestId, signal) {
      signal.throwIfAborted();
      return {
        requestId,
        client: { id: "sample-client", name: "Sample application" },
        resource: "https://sample.invalid/mcp",
        scopes: ["users.list", "users.read"],
        expiresAt: Date.now() + day,
      };
    },
    async decide(_requestId, approve, signal) {
      signal.throwIfAborted();
      if (approve && !grants.some((grant) => !grant.revoked)) {
        grants = [
          {
            ...grants[0]!,
            id: `sample-grant-${crypto.randomUUID()}`,
            revoked: false,
          },
        ];
      }
      return { redirect: "/connected-applications" };
    },
    async grants(signal) {
      signal.throwIfAborted();
      return structuredClone(grants);
    },
    async revoke(id, signal) {
      signal.throwIfAborted();
      grants = grants.map((grant) =>
        grant.id === id ? { ...grant, revoked: true } : grant
      );
    },
  };
}

export function createReviewWorkspaceServices(): WorkspaceServices {
  const catalogue: RuntimeCatalogue = {
    source: "static-build-manifest",
    availability: "unverified",
    configured: true,
    services: [
      {
        namespace: "sample-console",
        service: "sample-greeting",
        contract: {
          version: "1",
          methods: {
            greet: {
              mode: "unary",
              input: {
                type: "object",
                properties: { name: { type: "string" } },
                required: ["name"],
              },
              output: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"],
              },
              error: {
                type: "object",
                properties: { code: { type: "string" } },
              },
            },
          },
        },
      },
    ],
    greetingTrial: {
      enabled: true,
      target: {
        namespace: "sample-console",
        service: "sample-greeting",
        contractVersion: "1",
      },
      method: "greet",
      timeoutMs: 2000,
    },
  };
  const status: RuntimeSnapshot = {
    services: [
      {
        namespace: "sample-console",
        service: "sample-greeting",
        instance: "sample-browser-only",
        generation: "1",
        contract_version: "1",
        state: "ready",
        active_calls: 1,
        max_concurrency: 2,
        capabilities: [{ method: "greet", mode: "unary" }],
      },
    ],
    calls: [
      {
        id: "sample-active-call",
        namespace: "sample-console",
        service: "sample-greeting",
        method: "greet",
        trace_id: "sample-trace",
        parent_id: null,
        state: "active",
        remaining_ms: 1000,
      },
    ],
    recent: [
      {
        id: "sample-completed-call",
        namespace: "sample-console",
        service: "sample-greeting",
        method: "greet",
        trace_id: "sample-trace",
        parent_id: null,
        outcome: "Sample result",
        code: null,
        duration_ms: 0,
      },
    ],
  };
  return {
    async invoke<Request, Response>(
      service: string,
      operation: string,
      input: Request,
      options?: { signal?: AbortSignal }
    ): Promise<Response> {
      options?.signal?.throwIfAborted();
      let result: unknown;
      if (service === "runtime" && operation === "catalogue") {
        result = catalogue;
      } else if (service === "runtime" && operation === "status") {
        result = status;
      } else if (service === "runtime" && operation === "greet") {
        const name =
          typeof input === "object" && input !== null && "name" in input
            ? String(input.name).trim()
            : "";
        if (!name || name.length > 80) {
          throw new Error("Enter a sample name of 1 to 80 characters");
        }
        result = {
          message: `Sample greeting, ${name}. No Runtime service was called.`,
        };
      } else if (service === "authorization" && operation === "inspect") {
        result = {
          revision: "sample-policy-1",
          graph: {
            roles: [
              {
                id: "sample-owner",
                scope: { type: "console", id: consoleId },
                permissions: [],
              },
              {
                id: "sample-viewer",
                scope: { type: "console", id: consoleId },
                permissions: [],
              },
            ],
            bindings: [
              {
                id: "sample-binding",
                principal: {
                  realmId,
                  subjectId: sampleOperator,
                  kind: "human",
                },
                roleId: "sample-owner",
                scope: { type: "console", id: consoleId },
              },
            ],
          },
        };
      } else {
        throw new Error(`No sample operation: ${service}.${operation}`);
      }
      return structuredClone(result) as Response;
    },
    subscribe() {
      throw new Error("This sample preview has no live stream transport");
    },
  };
}
