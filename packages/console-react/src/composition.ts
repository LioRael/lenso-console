import type { ComponentType, ReactNode } from "react";

export type ConsolePosition = "bottom" | "top" | "left" | "right";
export type ConsoleNavigationReference = {
  bindingId: string;
  navigationId: string;
};

/** Ephemeral page identity. Never use this key as a persistence or authorization key. */
export interface ConsoleActivation {
  readonly key: string;
  isCurrent(): boolean;
}

export interface ConsoleLocalPageProps<Services = unknown> {
  services: Services;
  activation: ConsoleActivation;
  signal: AbortSignal;
  params: Readonly<Record<string, string>>;
  navigation: {
    href(pageId: string, params?: Readonly<Record<string, string>>): string;
    go(pageId: string, params?: Readonly<Record<string, string>>): void;
  };
}

export interface ConsolePageDefinition<Services = unknown> {
  title?: string;
  component: ComponentType<ConsoleLocalPageProps<Services>>;
}

export interface ConsolePageGroup {
  label: string;
  defaultPage: string;
  tabs: readonly { page: string; label: string }[];
  relatedPages?: Readonly<Record<string, { activeTab: string }>>;
}

export type ConsoleNavigationDefinition = {
  id: string;
  label: string;
  icon?: ReactNode;
  defaultPlacement?: "primary" | "more";
} & ({ page: string; group?: never } | { group: string; page?: never });

export interface ConsolePluginDefinition<Services = unknown> {
  id: string;
  pages: Readonly<Record<string, ConsolePageDefinition<Services>>>;
  pageGroups?: Readonly<Record<string, ConsolePageGroup>>;
  navigation?: readonly ConsoleNavigationDefinition[];
}

export interface ConsoleBinding<Services = unknown> {
  id: string;
  definition: ConsolePluginDefinition<Services>;
  routes: Readonly<Record<string, string>>;
  services: Services;
}

export function defineConsolePlugin<Services>(
  definition: ConsolePluginDefinition<Services>
): ConsolePluginDefinition<Services> {
  return definition;
}

export function bindConsole<Services>(
  definition: ConsolePluginDefinition<Services>,
  options: {
    id: string;
    routes: Readonly<Record<string, string>>;
    services: Services;
  }
): ConsoleBinding<Services> {
  return { definition, ...options };
}

/** Matching and history belong to the host router, not Console. */
export interface ConsoleRouterAdapter {
  pathname: string;
  navigate(href: string): void;
  match(
    pattern: string,
    pathname: string
  ): Readonly<Record<string, string>> | null;
}

export type ConsoleSessionState =
  | "ready"
  | "loading"
  | "authentication-required"
  | "forbidden"
  | "unavailable";

export interface ConsoleSessionAdapter {
  state: ConsoleSessionState;
  /** A trusted host changes this when subject, target or permission scope changes. */
  scopeKey: string;
  /** UI projection only. Every server operation still enforces its own policy. */
  canAccess?(bindingId: string, pageId: string): boolean;
}

export interface ConsolePreferences {
  pinned: readonly ConsoleNavigationReference[];
  mode: "dock" | "sidebar";
  position: ConsolePosition;
}

export interface ConsolePreferenceSnapshot {
  revision: string;
  /** null means no preference yet; pinned: [] is an intentional empty list. */
  value: ConsolePreferences | null;
}

/** The host binds this store to a trusted user/application scope. */
export interface ConsolePreferenceStore {
  read(options?: { signal?: AbortSignal }): Promise<ConsolePreferenceSnapshot>;
  save(
    input: { expectedRevision: string; value: ConsolePreferences },
    options?: { signal?: AbortSignal }
  ): Promise<ConsolePreferenceSnapshot>;
}
