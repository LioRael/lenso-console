export interface SessionDTO {
  readonly id: string;
  readonly realmId: string;
  readonly subjectId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly revision?: number;
  readonly kind?: string;
  readonly lastActiveAt?: number;
  readonly revokedAt?: number;
}

export interface SessionPageInput {
  readonly limit?: number;
  readonly cursor?: string;
}

export interface SessionPageDTO {
  readonly sessions: readonly SessionDTO[];
  readonly nextCursor: string | null;
}

export interface SubjectDTO {
  readonly realmId: string;
  readonly subjectId: string;
  readonly label?: string;
}

/** App-owned, deliberately projected descriptions, not Auth configuration. */
export interface AuthInfoDTO {
  readonly realm: string;
  readonly source: string;
  readonly policy: string;
}

export interface AuthConsoleCapabilities {
  readonly info: boolean;
  readonly sessionList: boolean;
  readonly sessionDetail: boolean;
  readonly sessionRevoke: boolean;
  readonly subjects: boolean;
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
}

export interface RevokeOptions extends RequestOptions {
  readonly expectedRevision?: number;
}

/** Implement with the application's existing SDK client, never a server adapter. */
export interface AuthConsoleClient {
  readonly capabilities: AuthConsoleCapabilities;
  info?(options?: RequestOptions): Promise<AuthInfoDTO>;
  listSessions?(options?: RequestOptions): Promise<readonly SessionDTO[]>;
  listSessionPage?(
    input: SessionPageInput,
    options?: RequestOptions
  ): Promise<SessionPageDTO>;
  readSession?(
    id: string,
    options?: RequestOptions
  ): Promise<SessionDTO | null>;
  revokeSession?(
    id: string,
    options?: RevokeOptions
  ): Promise<{ readonly revoked: boolean; readonly intentId?: string }>;
  listSubjects?(options?: RequestOptions): Promise<readonly SubjectDTO[]>;
}
