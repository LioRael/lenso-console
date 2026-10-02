import type * as React from "react";

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
    title: string;
    subject: Subject;
    owner: { instance: string };
    revision: string;
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
  signal: AbortSignal;
  services: WorkspaceServices;
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
