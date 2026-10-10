import type { ReactNode } from "react";

import type {
  ConsoleBinding,
  ConsoleDockViewReference,
  ConsoleNavigationReference,
  ConsolePosition,
  ConsolePreferences,
  ConsoleSessionAdapter,
} from "./composition";

// bindConsole captures each component/services pairing before collection erasure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConsoleShellBinding = ConsoleBinding<any>;

export interface ConsoleRoute {
  id: string;
  binding: ConsoleShellBinding;
  pageId: string;
  pattern: string;
}
export interface ConsoleNavigationItem {
  id: string;
  reference: ConsoleNavigationReference;
  label: string;
  icon: ReactNode;
  placement: "primary" | "more";
  route: ConsoleRoute;
  pages: readonly string[];
}
export function consoleReferenceKey(reference: ConsoleNavigationReference) {
  return JSON.stringify([reference.bindingId, reference.navigationId]);
}
export function normalizeConsolePath(path: string): string {
  const segments = path.split("/").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      throw new Error(`Invalid Console path encoding: ${path}`);
    }
  });
  if (
    /[?#\\]/.test(path) ||
    segments.some((part) => part === "." || part === ".." || /[/\\]/.test(part))
  ) {
    throw new Error(`Invalid Console path: ${path}`);
  }
  return `/${path.split("/").filter(Boolean).join("/")}`;
}
export function qualifyConsolePath(basePath: string, path: string): string {
  const base = normalizeConsolePath(basePath);
  const local = normalizeConsolePath(path);
  return base === "/" ? local : `${base}${local === "/" ? "" : local}`;
}
export function consoleRouteHref(
  pattern: string,
  params: Readonly<Record<string, string>> = {}
): string {
  return pattern.replaceAll(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined || value === "") {
      throw new Error(`Missing Console route parameter: ${name}`);
    }
    if (value === "." || value === "..") {
      throw new Error(`Invalid Console route parameter: ${name}`);
    }
    return encodeURIComponent(value);
  });
}
function routesOverlap(a: string, b: string) {
  const left = a.split("/");
  const right = b.split("/");
  return (
    left.length === right.length &&
    left.every(
      (part, index) =>
        part === right[index] ||
        part.startsWith(":") ||
        right[index]!.startsWith(":")
    )
  );
}
export function createConsoleModel(
  bindings: readonly ConsoleShellBinding[],
  basePath = "/",
  leading: readonly ConsoleDockViewReference[] = []
) {
  const routes: ConsoleRoute[] = [];
  const navigation: ConsoleNavigationItem[] = [];
  const views: ConsoleDockViewItem[] = [];
  const bindingIds = new Set<string>();
  for (const binding of bindings) {
    if (!binding.id || bindingIds.has(binding.id)) {
      throw new Error(`Duplicate or empty Console binding ID: ${binding.id}`);
    }
    bindingIds.add(binding.id);
    const viewIds = new Set<string>();
    for (const definition of binding.definition.dockViews ?? []) {
      if (!definition.id.trim() || viewIds.has(definition.id)) {
        throw new Error(
          `Duplicate or empty Console Dock view ID: ${binding.id}/${definition.id}`
        );
      }
      viewIds.add(definition.id);
      views.push({
        id: JSON.stringify([binding.id, definition.id]),
        binding,
        definition,
        reference: { bindingId: binding.id, viewId: definition.id },
      });
    }
    const pageIds = new Set(Object.keys(binding.definition.pages));
    for (const [pageId, path] of Object.entries(binding.routes)) {
      if (!pageIds.has(pageId)) {
        throw new Error(`Unknown Console page: ${binding.id}/${pageId}`);
      }
      const pattern = qualifyConsolePath(basePath, path);
      const parameters = new Set<string>();
      for (const segment of pattern.split("/")) {
        if (segment.includes(":") || segment.includes("*")) {
          if (
            !/^:[A-Za-z_][A-Za-z0-9_]*$/.test(segment) ||
            parameters.has(segment)
          ) {
            throw new Error(`Invalid Console route parameter: ${pattern}`);
          }
          parameters.add(segment);
        }
      }
      if (routes.some((route) => routesOverlap(route.pattern, pattern))) {
        throw new Error(`Conflicting Console route: ${pattern}`);
      }
      routes.push({
        id: JSON.stringify([binding.id, pageId]),
        binding,
        pageId,
        pattern,
      });
    }
    const routeFor = (page: string) => {
      const route = routes.find(
        (item) => item.binding === binding && item.pageId === page
      );
      if (!route) {
        throw new Error(`Console page requires a route: ${binding.id}/${page}`);
      }
      return route;
    };
    for (const [groupId, group] of Object.entries(
      binding.definition.pageGroups ?? {}
    )) {
      routeFor(group.defaultPage);
      const tabs = new Set<string>();
      for (const tab of group.tabs) {
        routeFor(tab.page);
        if (tabs.has(tab.page)) {
          throw new Error(
            `Duplicate Console tab: ${binding.id}/${groupId}/${tab.page}`
          );
        }
        tabs.add(tab.page);
      }
      if (!tabs.has(group.defaultPage)) {
        throw new Error(
          `Console group default must be a tab: ${binding.id}/${groupId}`
        );
      }
      for (const [page, related] of Object.entries(group.relatedPages ?? {})) {
        routeFor(page);
        if (!tabs.has(related.activeTab)) {
          throw new Error(
            `Unknown Console active tab: ${binding.id}/${groupId}/${related.activeTab}`
          );
        }
      }
    }
    const navigationIds = new Set<string>();
    for (const item of binding.definition.navigation ?? []) {
      if (!item.id || navigationIds.has(item.id)) {
        throw new Error(
          `Duplicate or empty Console navigation ID: ${binding.id}/${item.id}`
        );
      }
      navigationIds.add(item.id);
      const group =
        item.group === undefined
          ? undefined
          : binding.definition.pageGroups?.[item.group];
      if (item.group !== undefined && !group) {
        throw new Error(`Unknown Console group: ${binding.id}/${item.group}`);
      }
      const route = routeFor(group?.defaultPage ?? item.page!);
      consoleRouteHref(route.pattern);
      const reference = { bindingId: binding.id, navigationId: item.id };
      navigation.push({
        id: consoleReferenceKey(reference),
        reference,
        label: item.label,
        icon: item.icon,
        placement: item.defaultPlacement ?? "more",
        route,
        pages: group
          ? [
              ...group.tabs.map((tab) => tab.page),
              ...Object.keys(group.relatedPages ?? {}),
            ]
          : [route.pageId],
      });
    }
  }
  const seen = new Set<string>();
  const dockViews = leading.map((reference) => {
    const key = JSON.stringify([reference.bindingId, reference.viewId]);
    if (seen.has(key)) {
      throw new Error(`Duplicate Console Dock reference: ${key}`);
    }
    seen.add(key);
    const item = views.find((view) => view.id === key);
    if (!item) {
      throw new Error(`Unknown Console Dock reference: ${key}`);
    }
    return item;
  });
  return { routes, navigation, dockViews };
}

export interface ConsoleDockViewItem {
  id: string;
  binding: ConsoleShellBinding;
  definition: NonNullable<
    ConsoleShellBinding["definition"]["dockViews"]
  >[number];
  reference: ConsoleDockViewReference;
}

export function visibleConsoleDockViews(
  items: readonly ConsoleDockViewItem[],
  session?: ConsoleSessionAdapter
) {
  if (session && session.state !== "ready") {
    return [];
  }
  return items.filter(
    (item) =>
      !session?.canAccessDockView ||
      session.canAccessDockView(item.reference.bindingId, item.reference.viewId)
  );
}
export function visibleConsoleNavigation(
  items: readonly ConsoleNavigationItem[],
  session?: ConsoleSessionAdapter
) {
  if (session && session.state !== "ready") {
    return [];
  }
  return items.filter(
    (item) =>
      !session?.canAccess ||
      session.canAccess(item.reference.bindingId, item.route.pageId)
  );
}
export function defaultConsolePreferences(
  items: readonly ConsoleNavigationItem[],
  defaults?: Partial<ConsolePreferences>
): ConsolePreferences {
  return {
    pinned:
      defaults?.pinned ??
      items
        .filter((item) => item.placement === "primary")
        .map((item) => item.reference),
    mode: defaults?.mode ?? "dock",
    position: defaults?.position ?? "bottom",
  };
}
export function orderedConsolePins(
  items: readonly ConsoleNavigationItem[],
  preferences: ConsolePreferences
) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  return preferences.pinned.flatMap((reference) => {
    const key = consoleReferenceKey(reference);
    const item = byId.get(key);
    if (!item || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [item];
  });
}
export function moveConsolePin(
  pinned: readonly ConsoleNavigationReference[],
  from: number,
  to: number
) {
  const result = [...pinned];
  if (from < 0 || to < 0 || from >= result.length || to >= result.length) {
    return result;
  }
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item!);
  return result;
}
export const consolePositions: readonly ConsolePosition[] = [
  "bottom",
  "top",
  "left",
  "right",
];
