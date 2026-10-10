import type {
  ConsoleActivation,
  ConsoleBinding,
  ConsolePageDefinition,
} from "@lenso/console-react";
import { createElement } from "react";

import type { AuthConsoleClient } from "./contracts";
import { InfoPage, SessionPage, SessionsPage, SubjectsPage } from "./pages";

export type AuthConsolePage = "info" | "sessions" | "session" | "subjects";

/** The host supplies an existing SDK client, never a server Plugin. */
export function authConsole(options: {
  readonly id: string;
  readonly label?: string;
  readonly client: AuthConsoleClient;
  readonly routes: Partial<Record<AuthConsolePage, string>>;
  readonly pages?: Partial<
    Record<AuthConsolePage, ConsolePageDefinition<AuthConsoleClient>>
  >;
}): ConsoleBinding<AuthConsoleClient> {
  const { client } = options;
  const supported: Record<AuthConsolePage, boolean> = {
    info: client.capabilities.info && typeof client.info === "function",
    sessions:
      client.capabilities.sessionList &&
      (typeof client.listSessions === "function" ||
        typeof client.listSessionPage === "function"),
    session:
      client.capabilities.sessionDetail &&
      typeof client.readSession === "function",
    subjects:
      client.capabilities.subjects && typeof client.listSubjects === "function",
  };
  const pages: Record<string, ConsolePageDefinition<AuthConsoleClient>> = {};
  const routes: Record<string, string> = {};
  const defaults: Record<
    AuthConsolePage,
    ConsolePageDefinition<AuthConsoleClient>
  > = {
    info: { title: "Auth information", component: InfoPage },
    sessions: { title: "Sessions", component: SessionsPage },
    session: { title: "Session", component: SessionPage },
    subjects: { title: "Subjects", component: SubjectsPage },
  };
  for (const page of Object.keys(supported) as AuthConsolePage[]) {
    const definition = options.pages?.[page] ?? defaults[page];
    const route = options.routes[page];
    if (supported[page] && definition !== undefined && route !== undefined) {
      pages[page] = {
        ...definition,
        title: options.label
          ? `${options.label}: ${definition.title ?? page}`
          : (definition.title ?? page),
      };
      routes[page] = route;
    }
  }
  // Do not expose a revoke function when its capability is absent.
  const services: AuthConsoleClient = Object.freeze({
    capabilities: Object.freeze({
      ...client.capabilities,
      sessionDetail: supported.session && routes.session !== undefined,
      sessionRevoke:
        client.capabilities.sessionRevoke &&
        typeof client.revokeSession === "function",
    }),
    ...(supported.info ? { info: client.info!.bind(client) } : {}),
    ...(supported.sessions && client.listSessions
      ? { listSessions: client.listSessions.bind(client) }
      : {}),
    ...(supported.sessions && client.listSessionPage
      ? { listSessionPage: client.listSessionPage.bind(client) }
      : {}),
    ...(supported.session
      ? { readSession: client.readSession!.bind(client) }
      : {}),
    ...(client.capabilities.sessionRevoke &&
    typeof client.revokeSession === "function"
      ? { revokeSession: client.revokeSession.bind(client) }
      : {}),
    ...(supported.subjects
      ? { listSubjects: client.listSubjects!.bind(client) }
      : {}),
  });
  return {
    id: options.id,
    definition: {
      id: "auth-console",
      pages,
      navigation: Object.keys(pages)
        .filter((page) => page !== "session")
        .map((page) => ({
          id: page,
          page,
          label: pages[page]!.title ?? page,
        })),
    },
    routes,
    services,
  };
}

export type {
  AuthConsoleClient,
  AuthConsoleCapabilities,
  AuthInfoDTO,
  SessionDTO,
  SessionPageDTO,
  SessionPageInput,
  SubjectDTO,
} from "./contracts";

/** Optional contributions: the application decides whether Dashboard receives them. */
export function authWidgets({
  binding,
}: {
  binding: ConsoleBinding<AuthConsoleClient>;
}) {
  if (!binding.services.capabilities.info || !binding.services.info) {
    return [];
  }
  function renderer({
    activation,
    signal,
  }: {
    activation: ConsoleActivation;
    signal: AbortSignal;
  }) {
    return createElement(InfoPage, {
      services: binding.services,
      activation,
      signal,
      params: {},
      navigation: {
        href() {
          throw new Error("The information widget has no navigation");
        },
        go() {
          throw new Error("The information widget has no navigation");
        },
      },
    });
  }
  return [
    {
      bindingId: binding.id,
      widgetId: "information",
      title: "Auth information",
      configVersion: 1,
      configSchema: {
        parse(input: unknown): Record<string, never> {
          if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input) ||
            Object.keys(input).length !== 0
          ) {
            throw new Error("Auth information widget accepts no configuration");
          }
          return {};
        },
      },
      defaultConfig: {},
      sizes: {
        default: { width: 4, height: 3 },
        min: { width: 2, height: 2 },
        max: { width: 12, height: 12 },
      },
      renderer,
    },
  ];
}
