import type { ComponentType, createElement } from "react";
import type * as React from "react";

interface Mount {
  subject: { appId: string; kind: "app" } | { kind: "console" };
  title: string;
}

interface PageProps {
  location: { hash: string; search: string; segments: readonly string[] };
  mount: Mount;
  navigation: {
    go(segments: readonly string[]): void;
    href(segments: readonly string[]): string;
  };
  signal: AbortSignal;
}

interface Services {
  invoke<Request, Response>(
    service: string,
    operation: string,
    request: Request,
    options?: { signal?: AbortSignal }
  ): Promise<Response>;
  subscribe<Request, Item>(
    service: string,
    operation: string,
    request: Request,
    options?: { signal?: AbortSignal }
  ): AsyncIterable<Item>;
}

export const apiMajor: 1;
export function createWorkspace(runtime: {
  createElement: typeof createElement;
  react: typeof React;
  services: Services;
}): { Page: ComponentType<PageProps> };
