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
  styles: readonly string[];
  subject: "console";
  title: string;
};

const demoCatalog: readonly PageMount[] = [
  {
    apiMajor: 1,
    id: "welcome",
    module: `data:text/javascript,${encodeURIComponent(`
      export const apiMajor = 1;
      export const createPage = ({ createElement }) => ({
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
    styles: [
      `data:text/css,${encodeURIComponent(
        ".welcome-contribution { padding: 2rem; }"
      )}`,
    ],
    subject: "console",
    title: "Extension workspace",
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
      candidate.subject !== "console" ||
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
      !validNavigationItems(candidate.navigation.items)
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
      styles: candidate.styles,
      subject: candidate.subject,
      title: candidate.title,
    };
    return mount;
  });
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
  return (
    relative.length > 0 &&
    relative
      .split("/")
      .every((segment) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment))
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
    staleTime: 15_000,
  });
}
