/** Browser-safe contracts. Identity, credentials and scope are bound by the host. */
export interface DirectoryUser {
  readonly subjectId: string;
  readonly realmId: string;
  readonly label: string;
  readonly source: string;
  readonly status: "active" | "disabled" | "external";
}

export interface PageInput {
  readonly search?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export const administrationActions = [
  "users.list",
  "users.read",
  "users.disable",
  "sessions.list",
  "sessions.revoke",
  "members.list",
  "members.write",
  "members.promote",
  "roles.list",
  "roles.write",
  "permissions.read",
  "tokens.list",
  "tokens.issue",
  "tokens.rotate",
  "tokens.revoke",
  "audit.list",
] as const;

export type AdministrationAction = (typeof administrationActions)[number];

export const readOnlyAdministrationActions = administrationActions.filter(
  (action) => action.endsWith(".list") || action.endsWith(".read")
);

export interface Member {
  readonly subjectId: string;
  readonly realmId: string;
  readonly roleId: string;
  readonly status: "active" | "revoked";
}

export interface ConsoleRole {
  readonly id: string;
  readonly label: string;
  readonly permissions: readonly AdministrationAction[];
  readonly preset: boolean;
}

export interface AccessSnapshot {
  readonly revision: string;
  readonly consoleId: string;
  readonly tenantId: string;
  readonly members: readonly Member[];
  readonly roles: readonly ConsoleRole[];
}

export interface EffectivePermissions {
  readonly subjectId: string;
  readonly revision: string;
  readonly allowed: readonly AdministrationAction[];
  readonly sources: readonly {
    readonly roleId: string;
    readonly permissions: readonly AdministrationAction[];
  }[];
}

export interface AdministrationSession {
  readonly id: string;
  readonly subjectId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly revokedAt?: number | null;
  readonly revision: number;
}

export interface PersonalToken {
  readonly id: string;
  readonly subjectId: string;
  readonly consoleId: string;
  readonly tenantId: string;
  readonly scopes: readonly AdministrationAction[];
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly revision: number;
  readonly overlapUntil: number | null;
}

export interface CredentialDelivery {
  readonly token: PersonalToken;
  /** One-time delivery only; never place this response in a read cache. */
  readonly credential: string | null;
  readonly replayed: boolean;
}

export interface ManagementEvent {
  readonly id: string;
  readonly occurredAt: number;
  readonly action: string;
  readonly subjectId: string;
  readonly result: string;
  readonly targetId: string;
}

export interface AdministrationInfo {
  readonly consoleId: string;
  readonly tenantId: string;
  readonly realmId: string;
  readonly source: string;
  readonly mcpUrl: string;
  readonly allowed: readonly AdministrationAction[];
  readonly supported: {
    readonly userDisable: boolean;
    readonly sessions: boolean;
    readonly sessionRevoke: boolean;
  };
  readonly authentication: "personal-token";
  readonly observedLastCallAt: number | null;
}

export interface AdministrationInputs {
  info: Record<string, never>;
  usersList: PageInput;
  usersRead: { subjectId: string };
  usersDisable: { subjectId: string; expectedRevision: string };
  sessionsList: PageInput & { subjectId: string };
  sessionsRevoke: { id: string; subjectId: string; expectedRevision: number };
  accessRead: Record<string, never>;
  membersSet: { subjectId: string; roleId: string; expectedRevision: string };
  membersRevoke: { subjectId: string; expectedRevision: string };
  membersPromote: {
    subjectId: string;
    roleId: string;
    expectedRevision: string;
  };
  rolesSave: {
    id: string;
    label: string;
    permissions: readonly AdministrationAction[];
    expectedRevision: string;
  };
  permissionsRead: { subjectId: string };
  tokensList: PageInput;
  tokensRevoke: { id: string; expectedRevision: number };
  auditList: PageInput;
}

export interface AdministrationOutputs {
  info: AdministrationInfo;
  usersList: Page<DirectoryUser>;
  usersRead: DirectoryUser | null;
  usersDisable: { changed: boolean; intentId: string };
  sessionsList: Page<AdministrationSession>;
  sessionsRevoke: { revoked: boolean; intentId: string };
  accessRead: AccessSnapshot;
  membersSet: AccessSnapshot;
  membersRevoke: AccessSnapshot;
  membersPromote: AccessSnapshot;
  rolesSave: AccessSnapshot;
  permissionsRead: EffectivePermissions;
  tokensList: Page<PersonalToken>;
  tokensRevoke: { revoked: boolean; intentId: string };
  auditList: Page<ManagementEvent>;
}

export type AdministrationMethod = keyof AdministrationInputs;

export interface AdministrationClient {
  invoke<M extends AdministrationMethod>(
    method: M,
    input: AdministrationInputs[M],
    options?: { signal?: AbortSignal }
  ): Promise<AdministrationOutputs[M]>;
  /** Protected human-only credential channel, deliberately not a generic Manage operation. */
  issueToken(input: {
    scopes: readonly AdministrationAction[];
    expiresAt: number;
    requestId: string;
  }): Promise<CredentialDelivery>;
  rotateToken(input: {
    id: string;
    expectedRevision: number;
    overlapMs: number;
  }): Promise<CredentialDelivery>;
}
