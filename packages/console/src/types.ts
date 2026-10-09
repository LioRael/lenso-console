import type { Actor } from "@lenso/auth";
import type {
  ConfigBinding,
  Plugin,
  PluginContext,
  RunningApp,
} from "@lenso/core";
import type {
  Operation,
  OperationBoundOptions,
} from "@lenso/engine/operations";
import type { Manage } from "@lenso/manage";

import type { consoleConfiguration } from "./configuration";

export interface ConsoleResource {
  action: "session" | "list" | "invoke" | "configure" | "admin";
  targetId: string;
  tenantId: string;
  pluginId?: string;
  operation?: string;
  mountId?: string;
}

export interface ConsoleIdentity {
  readonly actor: Actor;
  readonly readScope: string;
}

export interface ConsoleAuthentication {
  admit(request: Request): void;
  authenticate(request: Request): Promise<ConsoleIdentity>;
  enforce(identity: ConsoleIdentity, resource: ConsoleResource): Promise<void>;
  can(identity: ConsoleIdentity, resource: ConsoleResource): Promise<boolean>;
  session(identity: ConsoleIdentity): Promise<{
    administrator: boolean;
    workspace_ids: readonly string[];
  }>;
  fetch(request: Request): Promise<Response | undefined>;
}

export interface ConsolePageDescriptor {
  apiMajor: 1;
  protocol?: "lenso-console-rpc/2";
  id: string;
  title: string;
  subject: { kind: "console" } | { kind: "app"; appId: string };
  owner: { instance: string; source: "application"; trusted: true };
  revision: string;
  implementationId: string;
  pageId?: string;
  basePath?: string;
  module: string;
  styles: readonly string[];
  navigation: {
    label: string;
    items: readonly { label: string; path: readonly string[] }[];
  };
  access?: "member" | "administrator";
  index?: readonly string[];
  routes?: readonly (readonly string[])[];
  requirements: readonly {
    service_id: string;
    capability_id: string;
    descriptor_version: string;
    operations: readonly string[];
    available: boolean;
    required: boolean;
    source: "owner" | "subject";
  }[];
}

export interface ConsoleMount {
  readonly descriptor: ConsolePageDescriptor;
  readonly services: Readonly<
    Record<
      string,
      {
        readonly manage: Manage;
        readonly operations: readonly Operation[];
      }
    >
  >;
  /** Only explicitly installed, owner-built assets, never descriptor-selected URLs. */
  readonly asset: (relativePath: string) => Promise<Response | undefined>;
}

export interface ConsoleTarget {
  readonly id: string;
  readonly label: string;
  readonly tenantId: string;
  readonly plugins: readonly Plugin<unknown>[];
  readonly manage: readonly Manage[];
  readonly mounts?: readonly ConsoleMount[];
  /** A borrowed app is not started or stopped by Console. Omit for this app's dependencies. */
  readonly running?: RunningApp;
}

export interface ConsoleOptions {
  readonly id?: string;
  readonly config?: ConfigBinding<typeof consoleConfiguration.schema>;
  readonly authentication: Plugin<ConsoleAuthentication>;
  readonly targets: readonly ConsoleTarget[];
  readonly apiBasePath?: string;
  readonly shellBasePath?: string;
  readonly authBasePath?: string;
  readonly management?: boolean;
  readonly binding: (
    operation: Operation,
    input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    resource: ConsoleResource
  ) =>
    | OperationBoundOptions<Operation>
    | Promise<OperationBoundOptions<Operation>>;
  /** Write guarantees belong to the service. Absence closes write/unknown operations. */
  readonly canWrite?: (
    operation: Operation,
    resource: ConsoleResource
  ) => boolean;
  /** Explicit route ownership; required when a shell adapter is installed. */
  readonly shellMatches?: (request: Request) => boolean;
  readonly shell?: (request: Request) => Promise<Response | undefined>;
}

export interface ConsoleService {
  fetch(request: Request): Promise<Response | undefined>;
}

export type ConsoleRuntime = Pick<
  PluginContext,
  "instanceId" | "logger" | "get" | "configuration"
>;
