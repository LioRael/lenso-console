import { useQuery } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../../lib/http-client";

export type PageMount = {
  apiMajor: 1;
  id: string;
  module: string;
  navigation: {
    items: readonly { label: string; path: readonly string[] }[];
    label: string;
  };
  owner: {
    instance: string;
    source: "development-filesystem" | "resolved-plan";
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
          createElement("h1", null, "Extension workspace"),
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
      label: "Extensions",
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
    title: "Extension workspace",
  },
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
      !("requirements" in candidate) ||
      !Array.isArray(candidate.requirements) ||
      !candidate.requirements.every(validRequirement)
    ) {
      throw new TypeError("Console page mount is malformed");
    }
    ids.add(candidate.id);
    const mount: PageMount = {
      apiMajor: candidate.apiMajor,
      id: candidate.id,
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
    (value.source === "resolved-plan" ||
      value.source === "development-filesystem") &&
    "trusted" in value &&
    typeof value.trusted === "boolean" &&
    value.trusted === (value.source === "resolved-plan")
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

async function readPageCatalog(signal: AbortSignal) {
  if (!isApiMode()) {
    return demoCatalog;
  }
  return parsePageCatalog(
    await httpClient.get("api/console/v1/pages", { signal }).json()
  );
}

export function usePageCatalog() {
  return useQuery({
    queryKey: ["console-page-catalog"],
    queryFn: ({ signal }) => readPageCatalog(signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
