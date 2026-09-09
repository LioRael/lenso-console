import type { ComponentType, createElement } from "react";
import type * as React from "react";

export interface TraceAttribute {
  key: string;
  value: string;
}

export interface TraceEvent {
  attributes: TraceAttribute[];
  name: string;
  timestamp_unix_nano: string;
}

export interface TraceLink {
  attributes: TraceAttribute[];
  span_id: string;
  trace_id: string;
}

export interface TraceSpan {
  attributes: TraceAttribute[];
  ended_at_unix_nano: string;
  events?: TraceEvent[];
  kind:
    | "unspecified"
    | "internal"
    | "server"
    | "client"
    | "producer"
    | "consumer";
  links?: TraceLink[];
  name: string;
  parent_span_id: string | null;
  span_id: string;
  started_at_unix_nano: string;
  status: "unset" | "ok" | "error";
}

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
