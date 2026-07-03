import { useGSAP } from "@gsap/react";
import { Link, useRouterState } from "@tanstack/react-router";
import gsap from "gsap";
import {
  Activity,
  Boxes,
  BriefcaseBusiness,
  Command,
  Database,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Sun,
  Users,
  Workflow,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentType, CSSProperties, PropsWithChildren } from "react";

import {
  consoleAdminActorLabel,
  useConsoleAdminContext,
} from "../../app/console-admin-context";
import { useConsoleNavigation } from "../../app/console-module-metadata";
import type {
  ConsoleNavigationItem,
  ConsoleSurfaceIcon,
} from "../../app/console-modules";
import {
  buildWorkspaceNavigation,
  type ConsoleWorkspaceNavigation,
  matchedWorkspaceIdForPath,
  selectedWorkspaceForId,
  SYSTEM_WORKSPACE,
} from "../../app/console-workspace-navigation";
import { usePersistedLayout } from "../../hooks/use-persisted-layout";
import { isApiMode, runtimeConsoleDataSource } from "../../lib/http-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { CommandPalette } from "./command-palette";
import { RetryDialog } from "./retry-dialog";
import { useRuntimeConsole } from "./runtime-console-context";
import { RuntimeSearch } from "./runtime-search";

gsap.registerPlugin(useGSAP);

type ShellIcon = ComponentType<{ size?: number; strokeWidth?: number }>;
type Theme = "dark" | "light";
type ThemePreference = Theme | "system";

const iconRegistry = {
  activity: Activity,
  boxes: Boxes,
  database: Database,
  network: Network,
  shield: Shield,
  settings: Settings,
  workflow: Workflow,
} satisfies Record<ConsoleSurfaceIcon, ShellIcon>;

const namedIconRegistry: Record<string, ShellIcon> = {
  ...iconRegistry,
  briefcase: BriefcaseBusiness,
  "briefcase-business": BriefcaseBusiness,
  briefcasebusiness: BriefcaseBusiness,
  users: Users,
};

const hostPrimaryNavItems = [
  {
    icon: "workflow",
    label: "Launchpad",
    moduleId: "host",
    navigation: {
      order: 0,
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/launchpad",
  },
  {
    icon: "activity",
    label: "Overview",
    moduleId: "host",
    navigation: {
      order: 10,
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/overview",
  },
  {
    icon: "network",
    label: "Operations",
    moduleId: "host",
    navigation: {
      order: 80,
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/operations",
  },
  {
    icon: "network",
    label: "Services",
    moduleId: "host",
    navigation: {
      order: 85,
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/services",
  },
  {
    icon: "boxes",
    label: "Modules",
    moduleId: "host",
    navigation: {
      order: 90,
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/modules",
  },
  {
    icon: "database",
    label: "Data",
    moduleId: "host",
    navigation: {
      order: 100,
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/data",
  },
  {
    icon: "settings",
    label: "Configuration",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/config",
  },
] satisfies ConsoleNavigationItem[];

export function RuntimeConsoleShell({ children }: PropsWithChildren) {
  const shellRef = useRef<HTMLDivElement>(null);
  const { focusGlobalSearch, openCommandPalette } = useRuntimeConsole();
  const consoleNavigation = useConsoleNavigation();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const primaryNavItems = useMemo(
    () => [...hostPrimaryNavItems, ...consoleNavigation],
    [consoleNavigation]
  );
  const workspaceNavigation = useMemo(
    () => buildWorkspaceNavigation(primaryNavItems),
    [primaryNavItems]
  );
  const routeWorkspaceId = useMemo(
    () => matchedWorkspaceIdForPath(workspaceNavigation, currentPath),
    [currentPath, workspaceNavigation]
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    usePersistedLayout<string>(
      "runtime-console:selected-workspace",
      SYSTEM_WORKSPACE.id
    );
  const activeWorkspace = useMemo(
    () => selectedWorkspaceForId(workspaceNavigation, selectedWorkspaceId),
    [selectedWorkspaceId, workspaceNavigation]
  );
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedLayout(
    "runtime-console:sidebar-collapsed",
    false
  );
  const [themePreference, setThemePreference] =
    usePersistedLayout<ThemePreference>(
      "runtime-console:theme-preference",
      "system"
    );
  const [systemTheme, setSystemTheme] = useState<Theme>(systemAppearanceTheme);
  const theme = themePreference === "system" ? systemTheme : themePreference;
  const initialCollapseRef = useRef(sidebarCollapsed ? 1 : 0);
  const animateSidebarRef = useRef(false);
  const previousSidebarCollapsedRef = useRef(sidebarCollapsed);

  const toggleSidebar = useCallback(() => {
    animateSidebarRef.current = true;
    setSidebarCollapsed((current) => !current);
  }, [setSidebarCollapsed]);

  const toggleTheme = useCallback(() => {
    setThemePreference(theme === "dark" ? "light" : "dark");
  }, [setThemePreference, theme]);

  const selectWorkspace = useCallback(
    (workspaceId: string) => {
      setSelectedWorkspaceId(workspaceId);
    },
    [setSelectedWorkspaceId]
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      setSystemTheme(query.matches ? "dark" : "light");
    };
    query.addEventListener("change", updateSystemTheme);
    return () => query.removeEventListener("change", updateSystemTheme);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = themePreference;
  }, [theme, themePreference]);

  useEffect(() => {
    if (!routeWorkspaceId) {
      return;
    }
    setSelectedWorkspaceId((current) =>
      current === routeWorkspaceId ? current : routeWorkspaceId
    );
  }, [routeWorkspaceId, setSelectedWorkspaceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        animateSidebarRef.current = true;
        setSidebarCollapsed((current) => !current);
        return;
      }

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        focusGlobalSearch();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusGlobalSearch, openCommandPalette, setSidebarCollapsed]);

  useGSAP(
    () => {
      const shell = shellRef.current;

      if (!shell) {
        return;
      }

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const collapse = sidebarCollapsed ? 1 : 0;
      const hasCollapsedChanged =
        previousSidebarCollapsedRef.current !== sidebarCollapsed;
      const shouldAnimate = animateSidebarRef.current && !reduceMotion;
      animateSidebarRef.current = false;
      previousSidebarCollapsedRef.current = sidebarCollapsed;
      gsap.killTweensOf(shell);

      if (!hasCollapsedChanged) {
        return;
      }

      if (!shouldAnimate) {
        gsap.set(shell, {
          "--sidebar-collapse": collapse,
        });
        return;
      }

      gsap.to(shell, {
        "--sidebar-collapse": collapse,
        duration: 0.28,
        ease: "power3.out",
      });
    },
    { dependencies: [sidebarCollapsed], scope: shellRef }
  );

  return (
    <div
      ref={shellRef}
      className="runtime-shell min-h-screen bg-(--bg-canvas) text-(--fg-primary) lg:grid"
      style={
        {
          "--sidebar-collapse": initialCollapseRef.current,
          gridTemplateColumns: "var(--sidebar-width) minmax(0,1fr)",
        } as CSSProperties
      }
    >
      <aside
        aria-label="Runtime Console navigation"
        className="relative overflow-hidden border-(--line) bg-(--bg-sidebar) lg:sticky lg:top-0 lg:h-screen lg:border-r max-lg:border-b"
      >
        <div className="h-11 border-b border-(--line) bg-(--bg-chrome) max-lg:hidden">
          <div className="sidebar-header flex h-full items-center">
            <div
              aria-hidden={sidebarCollapsed}
              className="sidebar-copy flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap"
            >
              <div className="grid h-6 min-w-6 place-items-center rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-1.5 text-(--accent)">
                <span className="text-[11px] font-semibold leading-none">
                  L
                </span>
              </div>
              <div
                aria-hidden={sidebarCollapsed}
                className="min-w-0 overflow-hidden whitespace-nowrap leading-tight"
              >
                <div className="text-xs font-semibold text-(--fg-primary)">
                  Lenso
                </div>
                <div className="text-[11px] text-(--fg-tertiary)">
                  Runtime Console
                </div>
              </div>
            </div>
            <button
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-control)] border border-transparent bg-transparent text-(--fg-tertiary) transition-colors hover:bg-(--bg-row-hover) hover:text-(--fg-primary)"
              onClick={toggleSidebar}
              title={
                sidebarCollapsed
                  ? "Expand sidebar (Cmd/Ctrl+B)"
                  : "Collapse sidebar (Cmd/Ctrl+B)"
              }
              type="button"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={13} />
              ) : (
                <PanelLeftClose size={13} />
              )}
            </button>
          </div>
        </div>

        <nav className="p-2 max-lg:overflow-x-auto">
          <div className="max-lg:flex max-lg:min-w-max max-lg:items-start max-lg:gap-2">
            <WorkspaceSwitcher
              activeWorkspaceId={activeWorkspace.id}
              onSelectWorkspace={selectWorkspace}
              workspaces={workspaceNavigation}
            />
            <div className="my-2 h-px bg-(--line) max-lg:hidden" />
            <WorkspaceMenu workspace={activeWorkspace} />
          </div>
        </nav>

        <div className="absolute right-0 bottom-0 left-0 border-t border-(--line) bg-(--bg-sidebar) p-2 max-lg:hidden">
          <div className="sidebar-status-item flex w-full items-center gap-2 rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-2">
            <div className="size-1.5 shrink-0 rounded-full bg-(--success)" />
            <span
              aria-hidden={sidebarCollapsed}
              className="sidebar-copy overflow-hidden whitespace-nowrap text-[11px] font-medium text-(--fg-primary)"
            >
              Online
            </span>
            <span
              aria-hidden={sidebarCollapsed}
              className="sidebar-copy ml-auto overflow-hidden whitespace-nowrap text-[11px] text-(--fg-tertiary)"
            >
              {runtimeConsoleDataSource()}
            </span>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-20 grid min-h-11 grid-cols-[minmax(220px,520px)_1fr_auto_auto_auto_auto] items-center gap-2 border-b border-(--line) bg-(--bg-chrome) px-3 max-lg:grid-cols-[1fr_auto] max-lg:px-2 max-sm:block max-sm:space-y-2 max-sm:py-2">
          <RuntimeSearch />
          <div />
          <Button
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="theme-toggle-button text-(--fg-secondary)"
            onClick={toggleTheme}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            variant="ghost"
          >
            {theme === "dark" ? (
              <Sun strokeWidth={1.9} />
            ) : (
              <Moon strokeWidth={1.9} />
            )}
          </Button>
          <Button
            className="max-sm:hidden"
            onClick={openCommandPalette}
            variant="ghost"
          >
            <Command size={13} />
            Command
            <span className="rounded border border-(--line) px-1.5 py-0.5 text-[11px] text-(--fg-tertiary)">
              ⌘K
            </span>
          </Button>
          <ConsoleDataSourceBadge />
          <ConsoleAdminContextBadge />
        </header>
        <div className="h-[calc(100vh-44px)] overflow-hidden">{children}</div>
      </main>
      <RetryDialog />
      <CommandPalette onToggleTheme={toggleTheme} theme={theme} />
    </div>
  );
}

function ConsoleDataSourceBadge() {
  const source = runtimeConsoleDataSource();

  return (
    <Badge className="h-7 text-[11px] max-lg:hidden" title={`data: ${source}`}>
      <Activity size={13} />
      {source}
    </Badge>
  );
}

function ConsoleAdminContextBadge() {
  const adminContextQuery = useConsoleAdminContext();
  const apiMode = isApiMode();
  const context = adminContextQuery.data;
  const label = context
    ? `${consoleAdminActorLabel(context.actor)} / ${capabilityCountLabel(
        context.capabilities
      )}`
    : apiMode
      ? adminContextQuery.isError
        ? "permission needed"
        : "checking actor"
      : "local actor";
  const title = context
    ? adminContextTitle(context)
    : adminContextQuery.isError && adminContextQuery.error instanceof Error
      ? adminContextQuery.error.message
      : apiMode
        ? "Loading Runtime Console admin actor context"
        : "Local mock Runtime Console capabilities";

  return (
    <Badge
      className={`h-7 max-w-[260px] overflow-hidden text-[11px] max-lg:hidden ${
        adminContextQuery.isError ? "text-[var(--tone-error-fg)]" : ""
      }`}
      title={title}
    >
      <Shield size={13} />
      <span className="min-w-0 truncate">{label}</span>
    </Badge>
  );
}

function capabilityCountLabel(capabilities: readonly string[]) {
  if (capabilities.includes("*")) {
    return "all capabilities";
  }
  return `${capabilities.length} ${
    capabilities.length === 1 ? "capability" : "capabilities"
  }`;
}

function adminContextTitle(context: {
  actor: Parameters<typeof consoleAdminActorLabel>[0];
  capabilities: readonly string[];
  scopes: readonly string[];
}) {
  const scopes = context.scopes.length > 0 ? context.scopes.join(", ") : "none";
  const capabilities =
    context.capabilities.length > 0 ? context.capabilities.join(", ") : "none";

  return [
    `actor: ${consoleAdminActorLabel(context.actor)}`,
    `scopes: ${scopes}`,
    `capabilities: ${capabilities}`,
  ].join("\n");
}

function WorkspaceSwitcher({
  activeWorkspaceId,
  onSelectWorkspace,
  workspaces,
}: {
  activeWorkspaceId: string;
  onSelectWorkspace: (workspaceId: string) => void;
  workspaces: ConsoleWorkspaceNavigation[];
}) {
  return (
    <div
      aria-label="Console workspaces"
      className="grid gap-px max-lg:flex max-lg:min-w-max"
    >
      {workspaces.map((workspace) => {
        const Icon = iconForWorkspace(workspace);
        const active = workspace.id === activeWorkspaceId;

        return (
          <button
            aria-pressed={active}
            className={`sidebar-nav-item flex h-7 w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-xs transition-colors max-lg:w-8 max-lg:min-w-8 max-lg:justify-center max-lg:px-2 ${
              active
                ? "native-selection"
                : "text-(--fg-secondary) hover:bg-(--bg-row-hover) hover:text-(--fg-primary)"
            }`}
            key={workspace.id}
            onClick={() => onSelectWorkspace(workspace.id)}
            title={workspace.label}
            type="button"
          >
            <Icon size={13} strokeWidth={1.5} />
            <span className="sidebar-copy min-w-0 overflow-hidden whitespace-nowrap max-lg:hidden">
              {workspace.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WorkspaceMenu({
  workspace,
}: {
  workspace: ConsoleWorkspaceNavigation;
}) {
  return (
    <div className="grid gap-px max-lg:flex max-lg:min-w-max">
      {workspace.items.map((item) => (
        <NavLink item={item} key={item.path} />
      ))}
      {workspace.groups.map((group) => {
        const GroupIcon = iconForName(group.icon);

        return (
          <div className="contents" key={group.id}>
            <div className="sidebar-copy sidebar-group-label mt-[var(--sidebar-group-label-margin)] flex items-center gap-1.5 overflow-hidden whitespace-nowrap px-2 text-[10px] font-semibold uppercase text-(--fg-tertiary) max-lg:hidden">
              {GroupIcon ? <GroupIcon size={11} strokeWidth={1.5} /> : null}
              <span className="min-w-0 truncate">{group.label}</span>
            </div>
            {group.items.map((item) => (
              <NavLink item={item} key={item.path} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function NavLink({ item }: { item: ConsoleNavigationItem }) {
  const Icon = iconForName(item.icon) ?? Activity;

  return (
    <Link
      activeProps={{
        className: "native-selection",
      }}
      aria-label={item.label}
      className="sidebar-nav-item flex h-7 w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-xs text-(--fg-secondary) transition-colors hover:bg-(--bg-row-hover) hover:text-(--fg-primary) max-lg:w-8 max-lg:min-w-8 max-lg:justify-center max-lg:px-2"
      title={item.label}
      to={item.path}
    >
      <Icon size={13} strokeWidth={1.5} />
      <span className="sidebar-copy min-w-0 overflow-hidden whitespace-nowrap max-lg:hidden">
        {item.label}
      </span>
    </Link>
  );
}

function iconForWorkspace(workspace: ConsoleWorkspaceNavigation): ShellIcon {
  return iconForName(workspace.icon) ?? Settings;
}

function iconForName(icon: string | undefined): ShellIcon | undefined {
  if (!icon) {
    return;
  }
  return namedIconRegistry[normalizedIconName(icon)];
}

function normalizedIconName(icon: string): string {
  return icon
    .trim()
    .replaceAll(/([a-z])([A-Z])/g, "$1-$2")
    .replaceAll(/[\s_]+/g, "-")
    .toLowerCase();
}

function systemAppearanceTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
