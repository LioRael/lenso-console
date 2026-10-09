import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useConsoleSession } from "../../app/console-session";
import { consoleHttpPaths } from "../../lib/console-http-paths";
import { httpClient, isApiMode } from "../../lib/http-client";
import {
  withIdentityRead,
  subscribeIdentityTransitions,
  subscribeWorkspaceIdentityTransitions,
} from "../../lib/identity-transition";
import { validWorkspaceBasePath, workspaceBasePath } from "./workspace-paths";
import {
  createWorkspaceServices,
  WorkspaceServiceDomainError,
  WorkspaceServiceError,
} from "./workspace-service-client";
import {
  readWorkspaceSourceSession,
  retireWorkspaceSources,
  workspaceSourceRetiredEvent,
  type WorkspaceSourceTransport,
} from "./workspace-source-session";

function workspaceRouteConflicts(mount: PageMount, basePath: string): boolean {
  const existing = workspaceBasePath(mount);
  if (existing !== "/") {
    return basePath.startsWith(existing) || existing.startsWith(basePath);
  }
  const prefix = basePath.split("/").filter(Boolean);
  if (!mount.routes) {
    return true;
  }
  const { routes } = mount;
  return routes.some((route) => {
    if (!route.length) {
      return false;
    }
    return prefix.slice(0, route.length).every((segment, index) => {
      const part = route[index];
      return part === segment || part?.startsWith("[");
    });
  });
}

export type PageMount = {
  transport?: WorkspaceSourceTransport;
  apiMajor: 1;
  protocol?: "lenso-console-rpc/2" | "workspace-http/1";
  id: string;
  basePath?: string;
  access?: "member" | "administrator";
  index?: readonly string[];
  routes?: readonly (readonly string[])[];
  pageId?: string;
  implementationId?: string;
  module: string;
  navigation: {
    items: readonly { label: string; path: readonly string[] }[];
    label: string;
  };
  owner: {
    instance: string;
    source: "application" | "development-filesystem" | "resolved-plan";
    trusted: boolean;
  };
  requirements: readonly {
    available: boolean;
    capability_id: string;
    descriptor_version: string;
    operations: readonly string[];
    required: boolean;
    service_id: string;
    source: "owner" | "subject";
  }[];
  revision: string;
  styles: readonly string[];
  subject: { kind: "console" } | { appId: string; kind: "app" };
  title: string;
};

function demoConsoleWorkspace(id: string, title: string): PageMount {
  return {
    apiMajor: 1,
    id,
    module: `data:text/javascript,${encodeURIComponent(`
      export const apiMajor = 1;
      export const createWorkspace = ({ createElement }) => ({
        Page: () => createElement(
          "section",
          { className: "welcome-contribution" },
          createElement("h1", null, ${JSON.stringify(title)}),
          createElement("p", null, "Development preview: no workspace data is connected.")
        )
      });
    `)}`,
    navigation: { items: [{ label: title, path: [] }], label: title },
    owner: {
      instance: `demo.${id}`,
      source: "development-filesystem",
      trusted: false,
    },
    requirements: [],
    revision: "demo",
    styles: [
      `data:text/css,${encodeURIComponent(
        ".welcome-contribution { padding: 2rem; }"
      )}`,
    ],
    subject: { kind: "console" },
    title,
  };
}

const demoCatalog: readonly PageMount[] = [
  {
    apiMajor: 1,
    id: "welcome",
    module: `data:text/javascript,${encodeURIComponent(`
      export const apiMajor = 1;
      export const createWorkspace = ({ createElement }) => ({
        Page: ({ location, mount }) => createElement(
          "section",
          { className: "welcome-contribution" },
          createElement("h1", null, "Welcome"),
          createElement("p", null, "Mount: " + mount.id),
          createElement("p", null, location.segments.join("/") || "Home")
        )
      });
    `)}`,
    navigation: {
      items: [
        { label: "Home", path: [] },
        { label: "Request example", path: ["request", "example"] },
      ],
      label: "Welcome",
    },
    owner: {
      instance: "demo.welcome",
      source: "development-filesystem",
      trusted: false,
    },
    requirements: [],
    revision: "demo",
    styles: [
      `data:text/css,${encodeURIComponent(
        ".welcome-contribution { padding: 2rem; }"
      )}`,
    ],
    subject: { kind: "console" },
    title: "Welcome",
  },
  demoConsoleWorkspace("projects", "Projects"),
  demoConsoleWorkspace("artifacts", "Artifacts"),
  demoConsoleWorkspace("apps", "Apps"),
  {
    apiMajor: 1,
    id: "development-overview",
    module: `data:text/javascript,${encodeURIComponent(`
      export const apiMajor = 1;
      export const createWorkspace = ({ createElement }) => ({
        Page: ({ mount }) => createElement(
          "section",
          { className: "welcome-contribution" },
          createElement("h1", null, "App workspace"),
          createElement("p", null, "Target: " + mount.subject.appId)
        )
      });
    `)}`,
    navigation: {
      items: [{ label: "Overview", path: [] }],
      label: "Development App",
    },
    owner: {
      instance: "demo.development-overview",
      source: "development-filesystem",
      trusted: false,
    },
    requirements: [],
    revision: "demo",
    styles: [],
    subject: { appId: "development", kind: "app" },
    title: "Development App",
  },
];

export function parsePageCatalog(value: unknown): readonly PageMount[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("schema" in value) ||
    value.schema !== "console.page-catalog/1" ||
    !("mounts" in value) ||
    !Array.isArray(value.mounts)
  ) {
    throw new TypeError("Console page catalog is malformed");
  }
  const ids = new Set<string>();
  return value.mounts.map((candidate) => {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !("id" in candidate) ||
      typeof candidate.id !== "string" ||
      !/^[a-z][a-z0-9._-]{0,63}$/u.test(candidate.id) ||
      ids.has(candidate.id) ||
      !("title" in candidate) ||
      typeof candidate.title !== "string" ||
      !candidate.title.trim() ||
      !("subject" in candidate) ||
      !validSubject(candidate.subject) ||
      !("apiMajor" in candidate) ||
      candidate.apiMajor !== 1 ||
      ("protocol" in candidate &&
        candidate.protocol !== "lenso-console-rpc/2" &&
        candidate.protocol !== "workspace-http/1") ||
      !("module" in candidate) ||
      typeof candidate.module !== "string" ||
      !isMountAssetUrl(candidate.module, candidate.id) ||
      !("styles" in candidate) ||
      !Array.isArray(candidate.styles) ||
      !candidate.styles.every(
        (style: unknown) =>
          typeof style === "string" && isMountAssetUrl(style, candidate.id)
      ) ||
      !("navigation" in candidate) ||
      !candidate.navigation ||
      typeof candidate.navigation !== "object" ||
      !("label" in candidate.navigation) ||
      typeof candidate.navigation.label !== "string" ||
      !candidate.navigation.label.trim() ||
      !("items" in candidate.navigation) ||
      !Array.isArray(candidate.navigation.items) ||
      !validNavigationItems(candidate.navigation.items) ||
      !("owner" in candidate) ||
      !validOwner(candidate.owner) ||
      !("revision" in candidate) ||
      typeof candidate.revision !== "string" ||
      !candidate.revision.trim() ||
      ("pageId" in candidate &&
        (typeof candidate.pageId !== "string" ||
          !/^[a-z][a-z0-9._-]{0,63}$/u.test(candidate.pageId))) ||
      ("implementationId" in candidate &&
        (typeof candidate.implementationId !== "string" ||
          !/^[a-f0-9]{64}$/u.test(candidate.implementationId) ||
          !candidate.module.startsWith(
            `/api/console/v1/pages/${candidate.id}/assets/${candidate.implementationId}/`
          ))) ||
      !("requirements" in candidate) ||
      !Array.isArray(candidate.requirements) ||
      !candidate.requirements.every(validRequirement)
    ) {
      throw new TypeError("Console page mount is malformed");
    }
    if (
      ("basePath" in candidate && typeof candidate.basePath !== "string") ||
      ("access" in candidate &&
        candidate.access !== "member" &&
        candidate.access !== "administrator") ||
      ("index" in candidate &&
        (!Array.isArray(candidate.index) ||
          !candidate.index.every(
            (segment: unknown) =>
              typeof segment === "string" &&
              /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(segment)
          ))) ||
      ("routes" in candidate &&
        (!Array.isArray(candidate.routes) ||
          !candidate.routes.length ||
          candidate.routes.length > 32 ||
          candidate.routes.some(
            (route: unknown) =>
              !Array.isArray(route) ||
              route.length > 8 ||
              route.some(
                (segment: unknown) =>
                  typeof segment !== "string" ||
                  !/^([A-Za-z0-9][A-Za-z0-9._-]{0,63}|\[(?:\.\.\.)?[A-Za-z][A-Za-z0-9_]*\]|\[\[\.\.\.[A-Za-z][A-Za-z0-9_]*\]\])$/u.test(
                    segment
                  )
              )
          )))
    ) {
      throw new TypeError("Console workspace path metadata is malformed");
    }
    ids.add(candidate.id);
    const mount: PageMount = {
      apiMajor: candidate.apiMajor,
      id: candidate.id,
      ...("basePath" in candidate
        ? { basePath: candidate.basePath as string }
        : {}),
      ...("access" in candidate
        ? { access: candidate.access as "member" | "administrator" }
        : {}),
      ...("index" in candidate ? { index: candidate.index as string[] } : {}),
      ...("routes" in candidate
        ? { routes: candidate.routes as string[][] }
        : {}),
      ...("pageId" in candidate ? { pageId: candidate.pageId as string } : {}),
      ...("implementationId" in candidate
        ? { implementationId: candidate.implementationId as string }
        : {}),
      module: candidate.module,
      navigation: {
        items: candidate.navigation.items,
        label: candidate.navigation.label,
      },
      owner: candidate.owner,
      requirements: candidate.requirements,
      revision: candidate.revision,
      styles: candidate.styles,
      subject: candidate.subject,
      title: candidate.title,
    };
    if (mount.basePath && !validWorkspaceBasePath(mount, mount.basePath)) {
      throw new TypeError("Console workspace path is invalid or reserved");
    }
    return mount;
  });
}

function validSubject(value: unknown): value is PageMount["subject"] {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    return false;
  }
  if (value.kind === "console") {
    return !("appId" in value);
  }
  return (
    value.kind === "app" &&
    "appId" in value &&
    typeof value.appId === "string" &&
    /^[a-z][a-z0-9._-]{0,63}$/u.test(value.appId)
  );
}

function validOwner(value: unknown): value is PageMount["owner"] {
  return (
    !!value &&
    typeof value === "object" &&
    "instance" in value &&
    typeof value.instance === "string" &&
    !!value.instance.trim() &&
    "source" in value &&
    (value.source === "application" ||
      value.source === "resolved-plan" ||
      value.source === "development-filesystem") &&
    "trusted" in value &&
    typeof value.trusted === "boolean" &&
    value.trusted ===
      (value.source === "application" || value.source === "resolved-plan")
  );
}

function validRequirement(
  value: unknown
): value is PageMount["requirements"][number] {
  return (
    !!value &&
    typeof value === "object" &&
    "available" in value &&
    typeof value.available === "boolean" &&
    "service_id" in value &&
    typeof value.service_id === "string" &&
    /^[a-z][a-z0-9._-]{0,63}$/u.test(value.service_id) &&
    "capability_id" in value &&
    typeof value.capability_id === "string" &&
    !!value.capability_id.trim() &&
    "descriptor_version" in value &&
    typeof value.descriptor_version === "string" &&
    !!value.descriptor_version.trim() &&
    "operations" in value &&
    Array.isArray(value.operations) &&
    value.operations.length > 0 &&
    value.operations.every(
      (operation: unknown) => typeof operation === "string" && !!operation
    ) &&
    "required" in value &&
    typeof value.required === "boolean" &&
    "source" in value &&
    (value.source === "owner" || value.source === "subject")
  );
}

function validNavigationItems(values: unknown[]): boolean {
  const paths = new Set<string>();
  return values.every((value) => {
    if (!isNavigationItem(value)) {
      return false;
    }
    const path = value.path.join("/");
    if (paths.has(path)) {
      return false;
    }
    paths.add(path);
    return true;
  });
}

function isNavigationItem(
  value: unknown
): value is { label: string; path: string[] } {
  return (
    !!value &&
    typeof value === "object" &&
    "label" in value &&
    typeof value.label === "string" &&
    !!value.label.trim() &&
    "path" in value &&
    Array.isArray(value.path) &&
    value.path.every(
      (segment: unknown) =>
        typeof segment === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(segment)
    )
  );
}

function isMountAssetUrl(value: string, mountId: string): boolean {
  const prefix = `/api/console/v1/pages/${mountId}/assets/`;
  if (!value.startsWith(prefix)) {
    return false;
  }
  const relative = value.slice(prefix.length);
  const [digest, ...segments] = relative.split("/");
  return (
    /^[a-f0-9]{64}$/u.test(digest ?? "") &&
    segments.length > 0 &&
    segments.every((segment) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment))
  );
}

async function readPageCatalog(
  signal: AbortSignal,
  account: string,
  report: (message: string) => void
) {
  if (!isApiMode()) {
    return demoCatalog;
  }
  const ordinary = parsePageCatalog(
    await httpClient.get("api/console/v1/pages", { signal }).json()
  );
  const mounts = [...ordinary];
  const failures: string[] = [];
  for (const source of consoleHttpPaths.workspace_sources ?? []) {
    try {
      const transport = await readWorkspaceSourceSession(
        source,
        account,
        signal
      );
      if (!transport) {
        continue;
      }
      await withIdentityRead(async () => {
        const lifetime = AbortSignal.any([signal, transport.signal]);
        const response = await fetch(
          `${source.api_base_path}/console/v1/pages`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: lifetime,
            headers: { "x-lenso-expected-subject": transport.subject },
          }
        );
        if ([401, 403, 412].includes(response.status)) {
          transport.retire();
          return;
        }
        if (!response.ok) {
          throw new Error("Workspace catalog is unavailable");
        }
        const foreign = parsePageCatalog(await response.json());
        lifetime.throwIfAborted();
        for (const mount of foreign) {
          const configured = source.mounts.find(
            (allowed) => allowed.id === mount.id
          );
          if (!configured) {
            continue;
          }
          if (
            mounts.some(
              (existing) =>
                existing.id === mount.id ||
                workspaceRouteConflicts(existing, configured.base_path)
            )
          ) {
            throw new Error(
              "Workspace route conflicts with an existing workspace"
            );
          }
          const scoped: PageMount = {
            ...mount,
            basePath: configured.base_path,
            transport,
            module: `${source.api_base_path}${mount.module.slice(4)}`,
            styles: mount.styles.map(
              (href) => `${source.api_base_path}${href.slice(4)}`
            ),
          };
          // Permission probes may deny individual projects for a partially
          // authorized actor. They cannot retire the whole admitted session.
          const services = createWorkspaceServices(
            {
              ...scoped,
              transport: { ...transport, retireForbidden: false },
            },
            lifetime,
            transport.subject
          );
          const allowed = new Set<string>();
          for (const check of configured.navigation_checks) {
            try {
              const result = await services.invoke<
                unknown,
                Record<string, unknown>
              >(check.service_id, check.operation, {}, { signal: lifetime });
              if (
                result &&
                check.fields.some((field) => result[field] === true)
              ) {
                allowed.add(check.path.join("/"));
              }
            } catch (error) {
              lifetime.throwIfAborted();
              if (
                !(
                  error instanceof WorkspaceServiceError && error.status === 403
                ) &&
                !(
                  error instanceof WorkspaceServiceDomainError &&
                  error.payload &&
                  typeof error.payload === "object" &&
                  "error" in error.payload &&
                  error.payload.error === "denied"
                )
              ) {
                failures.push(
                  "Some workspaces could not be checked. Retry workspace access."
                );
              }
            }
          }
          const items = mount.navigation.items.filter((item) =>
            allowed.has(item.path.join("/"))
          );
          if (items.length) {
            mounts.push({
              ...scoped,
              index: items[0]!.path,
              navigation: { ...mount.navigation, items },
            });
          }
        }
        lifetime.throwIfAborted();
      }, signal);
    } catch {
      signal.throwIfAborted();
      failures.push(
        "Some workspaces could not be checked. Retry workspace access."
      );
    }
  }
  signal.throwIfAborted();
  report(failures[0] ?? "");
  return mounts.filter((mount) => !mount.transport?.signal.aborted);
}

export function usePageCatalog() {
  const queryClient = useQueryClient();
  const { subject } = useConsoleSession();
  const [sourceError, setSourceError] = useState("");
  const configured = !!consoleHttpPaths.workspace_sources?.length;
  useEffect(() => {
    if (!configured) {
      return;
    }
    const prune = () =>
      queryClient.setQueriesData<readonly PageMount[]>(
        { queryKey: ["console-page-catalog"] },
        (mounts) => mounts?.filter((mount) => !mount.transport?.signal.aborted)
      );
    const changed = (phase: "begin" | "complete", sourceId?: string) => {
      if (phase === "begin") {
        retireWorkspaceSources(sourceId ? [sourceId] : undefined);
        prune();
      } else {
        void queryClient.invalidateQueries(
          { queryKey: ["console-page-catalog"] },
          { cancelRefetch: false }
        );
      }
    };
    const ordinary = subscribeIdentityTransitions(changed);
    const workspace = subscribeWorkspaceIdentityTransitions(changed);
    window.addEventListener(workspaceSourceRetiredEvent, prune);
    return () => {
      ordinary();
      workspace();
      window.removeEventListener(workspaceSourceRetiredEvent, prune);
    };
  }, [configured, queryClient]);
  const query = useQuery({
    queryKey: ["console-page-catalog"],
    queryFn: ({ signal }) => readPageCatalog(signal, subject, setSourceError),
    retry: false,
    staleTime: configured ? 10_000 : Number.POSITIVE_INFINITY,
    refetchInterval: configured ? 30_000 : false,
    ...(configured ? { refetchOnWindowFocus: "always" as const } : {}),
  });
  return { ...query, sourceError };
}
