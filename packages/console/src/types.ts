import type { Actor } from "@lenso/auth";
import type { ConsolePageAuthoringDescriptor } from "@lenso/console-sdk/protocol";
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
  /** Credential presence only, never verification; invalid credentials must not become public reads. */
  hasCredentials?(request: Request): boolean;
  authenticate(request: Request): Promise<ConsoleIdentity>;
  enforce(identity: ConsoleIdentity, resource: ConsoleResource): Promise<void>;
  can(identity: ConsoleIdentity, resource: ConsoleResource): Promise<boolean>;
  session(identity: ConsoleIdentity): Promise<{
    administrator: boolean;
    workspace_ids: readonly string[];
  }>;
  fetch(request: Request): Promise<Response | undefined>;
}

export type ConsolePageDescriptor = ConsolePageAuthoringDescriptor;

export interface ConsoleMount {
  readonly descriptor: ConsolePageDescriptor;
  readonly placement?: "page" | "global";
  readonly services: Readonly<
    Record<
      string,
      {
        readonly manage: Manage;
        readonly operations: readonly Operation[];
        readonly streams?: readonly ConsoleStream[];
        /** Explicit public names mapped to exact admitted owner methods. */
        readonly operationAliases?: Readonly<Record<string, string>>;
      }
    >
  >;
  /** Only explicitly installed, owner-built assets, never descriptor-selected URLs. */
  readonly asset: (relativePath: string) => Promise<Response | undefined>;
  /** Explicitly mounted separate credential routes; not Manage operations or asset-selected URLs. */
  readonly credentials?: {
    readonly issuePath: string;
    readonly rotatePath: string;
    readonly resources: Readonly<{
      issue: ConsoleResource;
      rotate: ConsoleResource;
    }>;
  };
}

export type ConsoleMountService = ConsoleMount["services"][string];

/** An explicit read subscription, not a finite Manage result or a write channel. */
export interface ConsoleStream {
  readonly operation: Operation;
  /** Owner-selected validation/projection for each public item. */
  readonly output: Operation["input"];
  readonly maxItemBytes?: number;
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
  readonly locale?: Plugin<ConsoleLocaleStore>;
  /** Independent global-default permission; never inferred from the administrator flag. */
  readonly localeResource?: ConsoleResource;
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
  /** Drain this entry's subscriptions only; never stop a borrowed application. */
  close?(): Promise<void>;
}

export type ConsoleLocale = "en" | "zh-CN";
export type ConsoleLanguagePreference = ConsoleLocale | "global";

/** The application owns durable storage, migrations and provider-side identity checks. */
export interface ConsoleLocaleStore {
  readDefault(signal: AbortSignal): Promise<ConsoleLocale | null>;
  readPreference(
    identity: ConsoleIdentity,
    signal: AbortSignal
  ): Promise<ConsoleLanguagePreference>;
  writePreference(
    identity: ConsoleIdentity,
    preference: ConsoleLanguagePreference,
    signal: AbortSignal
  ): Promise<void>;
  writeDefault(
    identity: ConsoleIdentity,
    locale: ConsoleLocale | null,
    signal: AbortSignal
  ): Promise<void>;
}

export type ConsoleRuntime = Pick<
  PluginContext,
  "instanceId" | "logger" | "get" | "configuration"
>;
