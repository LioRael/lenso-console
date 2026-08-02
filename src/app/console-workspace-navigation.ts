import type {
  ConsoleNavigationGroup,
  ConsoleNavigationItem,
  ConsoleNavigationMetadata,
  ConsoleSurfaceIcon,
  ConsoleWorkspaceRef,
} from "../../packages/console-ui-internal/src/index";

export const SYSTEM_WORKSPACE = {
  icon: "settings",
  id: "system",
  label: "System",
  localizedLabels: { "zh-CN": "系统" },
} satisfies ConsoleWorkspaceRef & { icon: ConsoleSurfaceIcon };

export type ConsoleWorkspaceNavigationGroup = ConsoleNavigationGroup & {
  items: ConsoleNavigationItem[];
};

export type ConsoleWorkspaceNavigation = ConsoleWorkspaceRef & {
  items: ConsoleNavigationItem[];
  groups: ConsoleWorkspaceNavigationGroup[];
};

type MutableWorkspaceNavigation = ConsoleWorkspaceNavigation & {
  groupsById: Map<string, ConsoleWorkspaceNavigationGroup>;
};

type WorkspaceRouteMatch = {
  path: string;
  workspaceId: string;
};

export type WorkspaceMenuNavigationKey =
  | "ArrowDown"
  | "ArrowUp"
  | "End"
  | "Home";

const DEFAULT_ORDER = Number.MAX_SAFE_INTEGER;

export function workspaceMenuIndexForKey(
  currentIndex: number,
  key: WorkspaceMenuNavigationKey,
  itemCount: number
): number | null {
  if (itemCount <= 0) {
    return null;
  }

  const normalizedIndex = Math.min(Math.max(currentIndex, 0), itemCount - 1);

  if (key === "ArrowDown") {
    return (normalizedIndex + 1) % itemCount;
  }
  if (key === "ArrowUp") {
    return (normalizedIndex - 1 + itemCount) % itemCount;
  }
  if (key === "End") {
    return itemCount - 1;
  }
  return 0;
}

export function navigationForItem(
  item: ConsoleNavigationItem
): ConsoleNavigationMetadata {
  return item.navigation ?? { workspace: SYSTEM_WORKSPACE };
}

export function buildWorkspaceNavigation(
  items: ConsoleNavigationItem[]
): ConsoleWorkspaceNavigation[] {
  const workspacesById = new Map<string, MutableWorkspaceNavigation>();

  for (const item of items) {
    const navigation = navigationForItem(item);
    const workspace = workspaceForRef(workspacesById, navigation.workspace);
    if (!navigation.group) {
      workspace.items.push(item);
      continue;
    }

    const group = groupForRef(workspace, navigation.group);
    group.items.push(item);
  }

  return [...workspacesById.values()]
    .map(({ groupsById: _groupsById, ...workspace }) => ({
      ...workspace,
      groups: workspace.groups
        .map((group) => ({
          ...group,
          items: sortedItems(group.items),
        }))
        .sort(compareGroups),
      items: sortedItems(workspace.items),
    }))
    .sort(compareWorkspaces);
}

export function activeWorkspaceIdForPath(
  workspaces: ConsoleWorkspaceNavigation[],
  path: string
): string {
  return matchedWorkspaceIdForPath(workspaces, path) ?? SYSTEM_WORKSPACE.id;
}

export function matchedWorkspaceIdForPath(
  workspaces: ConsoleWorkspaceNavigation[],
  path: string
): string | null {
  const routes = workspaceRoutes(workspaces);
  const exactMatch = routes.find((route) => route.path === path);
  if (exactMatch) {
    return exactMatch.workspaceId;
  }

  const [childMatch] = routes
    .filter((route) => path.startsWith(`${route.path}/`))
    .sort((left, right) => right.path.length - left.path.length);

  return childMatch?.workspaceId ?? null;
}

export function selectedWorkspaceForId(
  workspaces: ConsoleWorkspaceNavigation[],
  selectedWorkspaceId: string
): ConsoleWorkspaceNavigation {
  return (
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
    workspaces.find((workspace) => workspace.id === SYSTEM_WORKSPACE.id) ?? {
      ...SYSTEM_WORKSPACE,
      groups: [],
      items: [],
    }
  );
}

function workspaceForRef(
  workspacesById: Map<string, MutableWorkspaceNavigation>,
  workspaceRef: ConsoleWorkspaceRef
): MutableWorkspaceNavigation {
  const existing = workspacesById.get(workspaceRef.id);
  if (existing) {
    return existing;
  }

  const workspace = {
    ...workspaceRef,
    groups: [],
    groupsById: new Map<string, ConsoleWorkspaceNavigationGroup>(),
    items: [],
  };
  workspacesById.set(workspace.id, workspace);
  return workspace;
}

function groupForRef(
  workspace: MutableWorkspaceNavigation,
  groupRef: ConsoleNavigationGroup
): ConsoleWorkspaceNavigationGroup {
  const existing = workspace.groupsById.get(groupRef.id);
  if (existing) {
    return existing;
  }

  const group = {
    ...groupRef,
    items: [],
  };
  workspace.groupsById.set(group.id, group);
  workspace.groups.push(group);
  return group;
}

function sortedItems(items: ConsoleNavigationItem[]): ConsoleNavigationItem[] {
  return [...items].sort(compareItems);
}

function compareWorkspaces(
  left: ConsoleWorkspaceNavigation,
  right: ConsoleWorkspaceNavigation
): number {
  if (left.id === SYSTEM_WORKSPACE.id) {
    return right.id === SYSTEM_WORKSPACE.id ? 0 : -1;
  }
  if (right.id === SYSTEM_WORKSPACE.id) {
    return 1;
  }
  return compareText(left.label, right.label) || compareText(left.id, right.id);
}

function compareGroups(
  left: ConsoleWorkspaceNavigationGroup,
  right: ConsoleWorkspaceNavigationGroup
): number {
  return (
    compareOrder(left.order, right.order) ||
    compareText(left.label, right.label) ||
    compareText(left.id, right.id)
  );
}

function compareItems(
  left: ConsoleNavigationItem,
  right: ConsoleNavigationItem
): number {
  return (
    compareOrder(
      navigationForItem(left).order,
      navigationForItem(right).order
    ) ||
    compareText(left.label, right.label) ||
    compareText(left.path, right.path)
  );
}

function compareOrder(left?: number, right?: number): number {
  return (left ?? DEFAULT_ORDER) - (right ?? DEFAULT_ORDER);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function workspaceRoutes(
  workspaces: ConsoleWorkspaceNavigation[]
): WorkspaceRouteMatch[] {
  return workspaces.flatMap((workspace) =>
    workspaceItems(workspace).map((item) => ({
      path: item.path,
      workspaceId: workspace.id,
    }))
  );
}

function workspaceItems(
  workspace: ConsoleWorkspaceNavigation
): ConsoleNavigationItem[] {
  return [
    ...workspace.items,
    ...workspace.groups.flatMap((group) => group.items),
  ];
}
