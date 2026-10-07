import {
  canonicalWorkspacePath,
  isReservedConsolePath,
  matchPagePath,
} from "../../../../../../packages/console-authoring/src/paths";
import {
  consoleBasePath,
  consolePathFromLocation,
} from "../../app/console-router-config";
import type { PageMount } from "./page-contribution-catalog";

export function workspaceBasePath(mount: PageMount): string {
  return (
    mount.basePath ??
    (mount.subject.kind === "console"
      ? `/${mount.id}/`
      : `/apps/${mount.subject.appId}/${mount.id}/`)
  );
}

export function workspacePagePath(
  mount: PageMount,
  segments: readonly string[]
): string {
  if (
    segments.some(
      (segment) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(segment)
    )
  ) {
    throw new TypeError("Workspace navigation path is invalid");
  }
  const path = `${workspaceBasePath(mount)}${segments.length ? `${segments.join("/")}/` : ""}`;
  if (
    workspaceBasePath(mount) === "/" &&
    (isReservedConsolePath(path) || segments[0] === "admin")
  ) {
    throw new TypeError("Workspace navigation path is reserved");
  }
  if (
    segments.length &&
    mount.routes &&
    !mount.routes.some((route) => matchPagePath(route, segments))
  ) {
    throw new TypeError("Workspace navigation path is not registered");
  }
  return path;
}

export function workspacePageHref(
  mount: PageMount,
  segments: readonly string[]
): string {
  const prefix = consoleBasePath === "/" ? "" : consoleBasePath;
  return `${prefix}${workspacePagePath(mount, segments)}`;
}

export function resolveWorkspaceLocation(
  pathname: string,
  mounts: readonly PageMount[]
) {
  const path = consolePathFromLocation(pathname);
  if (!path.startsWith("/") || path.includes("%") || path.includes("//")) {
    return undefined;
  }
  const normalized = path.replace(/\/$/u, "");
  for (const mount of [...mounts].sort(
    (left, right) =>
      workspaceBasePath(right).length - workspaceBasePath(left).length
  )) {
    const basePath = workspaceBasePath(mount);
    const base = basePath.replace(/\/$/u, "");
    const relative =
      normalized === base
        ? ""
        : path.startsWith(basePath)
          ? path.slice(basePath.length).replace(/\/$/u, "")
          : undefined;
    if (
      relative === undefined ||
      (basePath === "/" &&
        (isReservedConsolePath(path) ||
          path === "/admin" ||
          path.startsWith("/admin/")))
    ) {
      continue;
    }
    const segments = relative ? relative.split("/") : [];
    if (
      segments.some(
        (segment) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(segment)
      )
    ) {
      continue;
    }
    if (
      segments.length &&
      mount.routes &&
      !mount.routes.some((route) => matchPagePath(route, segments))
    ) {
      continue;
    }
    return { mount, subject: mount.subject, workspaceId: mount.id, segments };
  }
  return undefined;
}

export function validWorkspaceBasePath(
  mount: Pick<PageMount, "subject" | "access">,
  path: string
): boolean {
  try {
    const prefix =
      mount.subject.kind === "app" ? `/apps/${mount.subject.appId}` : "";
    if (prefix && !path.startsWith(`${prefix}/`)) {
      return false;
    }
    return (
      `${prefix}${canonicalWorkspacePath(path.slice(prefix.length), mount.access === "administrator")}` ===
      path
    );
  } catch {
    return false;
  }
}
