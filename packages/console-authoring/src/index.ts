import type * as React from "react";

import type { ConsolePageDescriptor } from "./protocol";
import type { WorkspaceReads } from "./read";
import type { ReadRefreshPolicy } from "./read-refresh";
import type { WorkspaceServices } from "./service-types";

export type { WorkspaceServices } from "./service-types";

export type {
  ReadValue,
  ReadSnapshot,
  WorkspaceReadOptions,
  WorkspaceReadResult,
  WorkspaceReadClient,
  WorkspaceReads,
} from "./read";

export { defineWorkspace, type WorkspaceDeclaration } from "./workspace";
export {
  deriveReadRefreshState,
  resolveReadRefreshPolicy,
} from "./read-refresh";
export type {
  ReadRefreshPolicy,
  ReadRefreshQueryOptions,
} from "./read-refresh";

export type Subject = ConsolePageDescriptor["subject"];

/** Page view projection also supports local preview and older Host props. */
export type PageMount = Pick<
  ConsolePageDescriptor,
  "id" | "pageId" | "title" | "subject" | "revision" | "basePath"
> & {
  /** Content identity of the executable page, independent of its mount. */
  implementationId?: ConsolePageDescriptor["implementationId"];
  /** Mount/session cache namespace. Never cache by pageId alone. */
  scopeKey?: string;
  owner: Pick<ConsolePageDescriptor["owner"], "instance">;
  requirements?: readonly Pick<
    ConsolePageDescriptor["requirements"][number],
    "service_id" | "operations" | "available"
  >[];
};

export interface PageProps {
  /** Supplied by current hosts; older hosts still expose the request signal. */
  activation?: { readonly key: string; isCurrent(): boolean };
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
  mount: PageMount;
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
