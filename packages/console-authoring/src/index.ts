import type * as React from "react";

import type { WorkspaceReads } from "./read";
import type { ReadRefreshPolicy } from "./read-refresh";

export { useWorkspaceRead, useWorkspaceReadClient } from "./read";
export type {
  ReadValue,
  ReadSnapshot,
  WorkspaceReadOptions,
  WorkspaceReadResult,
  WorkspaceReadClient,
  WorkspaceReads,
} from "./read";

export { defineWorkspace, type WorkspaceDeclaration } from "./workspace";
export { Link, useWorkspace, WorkspaceScope } from "./navigation";
export {
  deriveReadRefreshState,
  resolveReadRefreshPolicy,
} from "./read-refresh";
export type {
  ReadRefreshPolicy,
  ReadRefreshQueryOptions,
} from "./read-refresh";

/** A browser-local service alias, admitted by the owning Plugin and Host. */
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
export type Subject = { kind: "console" } | { kind: "app"; appId: string };
export interface PageProps {
  /** Optional protected one-time credential channel, never a scoped read or Manage result. */
  credentials?: WorkspaceCredentials;
  /** Optional Host-owned placement for a Plugin's workspace navigation. */
  chrome?: { Sidebar: React.ComponentType<{ children: React.ReactNode }> };
  params: Readonly<Record<string, string | readonly string[]>>;
  environment: { locale: "en" | "zh-CN"; theme: "dark" | "light" };
  location: {
    hash: string;
    search: string;
    segments: readonly string[];
    handoff?: { kind: string; payload: unknown };
  };
  mount: {
    id: string;
    /** Plugin-declared page identity; several instance mounts may share it. */
    pageId?: string;
    /** Content identity of the executable page, independent of its mount. */
    implementationId?: string;
    /** Mount/session cache namespace. Never cache by pageId alone. */
    scopeKey?: string;
    title: string;
    subject: Subject;
    owner: { instance: string };
    revision: string;
    /** Resolved browser path; never a permission or cache identity. */
    basePath?: string;
    requirements?: readonly {
      service_id: string;
      operations: readonly string[];
      available: boolean;
    }[];
  };
  navigation: {
    go(segments: readonly string[]): void;
    href(segments: readonly string[]): string;
    openWorkspace(request: {
      workspaceId: string;
      subject: Subject;
      segments?: readonly string[];
      handoff?: { kind: string; payload: unknown };
    }): void;
  };
  /** Host and mount read defaults; individual pages may override freshness only. */
  readRefreshPolicy?: ReadRefreshPolicy;
  /** Optional on older Hosts; the SDK hook fails explicitly if unavailable. */
  reads?: WorkspaceReads;
  signal: AbortSignal;
  services: WorkspaceServices;
}

export interface WorkspaceCredentials {
  readonly operations: readonly ("issue" | "rotate")[];
  issue(
    input: { requestedScopes: string[]; expiresAt: number; requestId: string },
    options?: { signal?: AbortSignal }
  ): Promise<unknown>;
  rotate(
    input: { id: string; expectedRevision: number; overlapMs: number },
    options?: { signal?: AbortSignal }
  ): Promise<unknown>;
}

/** Type a page without coupling it to Console's private router or state. */
export function definePage(
  page: React.ComponentType<PageProps>
): React.ComponentType<PageProps> {
  return page;
}

export interface LayoutProps extends PageProps {
  children?: React.ReactNode;
}
export interface ErrorProps {
  error: Error;
  reset(): void;
}

export type { ConsoleLocaleValue } from "./locale";
export {
  createTranslations,
  resolveConsoleLocale,
  formatConsoleDate,
  formatConsoleNumber,
} from "./i18n";
export type {
  ConsoleLocale,
  ConsoleLanguagePreference,
  MessageCatalog,
  MessageValues,
  LocaleSnapshot,
} from "./i18n";
