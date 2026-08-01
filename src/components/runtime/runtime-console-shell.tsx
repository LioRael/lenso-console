import {
  consoleLocalizedLabel,
  type ConsoleLocale,
  useConsoleLocale,
} from "@lenso/console-package-api";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  Database,
  GitCompareArrows,
  Handshake,
  House,
  KeyRound,
  LayoutDashboard,
  Network,
  Rocket,
  Search,
  ServerCog,
  Settings,
  Shield,
  Users,
  Workflow,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { useConsoleNavigation } from "../../app/console-module-metadata";
import type {
  ConsoleNavigationItem,
  ConsoleSurfaceIcon,
} from "../../app/console-modules";
import {
  buildWorkspaceNavigation,
  matchedWorkspaceIdForPath,
  selectedWorkspaceForId,
  SYSTEM_WORKSPACE,
  type ConsoleWorkspaceNavigation,
} from "../../app/console-workspace-navigation";
import { consoleCopy } from "../../features/console-design/copy";
import { usePersistedLayout } from "../../hooks/use-persisted-layout";
import { CommandPalette } from "./command-palette";
import { RetryDialog } from "./retry-dialog";
import { useRuntimeConsole } from "./runtime-console-context";

type ShellIcon = ComponentType<{ size?: number; strokeWidth?: number }>;

const iconRegistry = {
  activity: Activity,
  boxes: Boxes,
  database: Database,
  "git-compare-arrows": GitCompareArrows,
  house: House,
  "key-round": KeyRound,
  network: Network,
  rocket: Rocket,
  "server-cog": ServerCog,
  shield: Shield,
  settings: Settings,
  users: Users,
  workflow: Workflow,
} satisfies Record<ConsoleSurfaceIcon, ShellIcon>;

const namedIconRegistry: Record<string, ShellIcon> = {
  ...iconRegistry,
  "building-2": Building2,
  handshake: Handshake,
  "layout-dashboard": LayoutDashboard,
};

const hostPrimaryNavItems = [
  hostItem("house", "Home", "/", 0),
  hostItem("server-cog", "System", "/system", 10),
  hostItem("boxes", "Modules", "/modules", 20),
  hostItem("git-compare-arrows", "Changes", "/changes", 30),
  hostItem("activity", "Runtime", "/runtime", 40),
  hostItem("workflow", "Stories", "/stories", 50),
  hostItem("rocket", "Delivery", "/delivery", 60),
] satisfies ConsoleNavigationItem[];

const hostSettingsNavItem = hostItem("settings", "Settings", "/settings", 70);

export function RuntimeConsoleShell({ children }: PropsWithChildren) {
  const { locale } = useConsoleLocale();
  const copy = consoleCopy(locale);
  const appearance = useConsoleAppearance();
  const { openCommandPalette } = useRuntimeConsole();
  const navigate = useNavigate();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const extensionNavigation = useConsoleNavigation().filter(
    (item) => item.moduleId !== "lenso/platform-story"
  );
  const navigation = useMemo(
    () =>
      buildWorkspaceNavigation([
        ...hostPrimaryNavItems,
        hostSettingsNavItem,
        ...extensionNavigation,
      ]),
    [extensionNavigation]
  );
  const routeWorkspaceId = useMemo(
    () => matchedWorkspaceIdForPath(navigation, currentPath),
    [currentPath, navigation]
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = usePersistedLayout(
    "runtime-console:selected-workspace",
    SYSTEM_WORKSPACE.id
  );
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedLayout(
    "runtime-console:sidebar-collapsed",
    false
  );
  const activeWorkspace = selectedWorkspaceForId(
    navigation,
    routeWorkspaceId ?? selectedWorkspaceId
  );

  useEffect(() => {
    if (routeWorkspaceId) {
      setSelectedWorkspaceId(routeWorkspaceId);
    }
  }, [routeWorkspaceId, setSelectedWorkspaceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((collapsed) => !collapsed);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openCommandPalette, setSidebarCollapsed]);

  const selectWorkspace = useCallback(
    (workspace: ConsoleWorkspaceNavigation) => {
      setSelectedWorkspaceId(workspace.id);
      const first = workspace.items[0] ?? workspace.groups[0]?.items[0];
      if (first) {
        void navigate({ to: first.path });
      }
    },
    [navigate, setSelectedWorkspaceId]
  );

  const toggleTheme = useCallback(() => {
    appearance.setPreference(appearance.theme === "dark" ? "light" : "dark");
  }, [appearance]);

  return (
    <div
      className={`grid min-h-screen bg-(--bg-canvas) text-(--fg-primary) ${sidebarCollapsed ? "grid-cols-[64px_minmax(0,1fr)]" : "grid-cols-[224px_minmax(0,1fr)] max-md:grid-cols-[64px_minmax(0,1fr)]"}`}
    >
      <aside className="sticky top-0 z-30 flex h-screen flex-col border-r border-(--line) bg-(--bg-sidebar) p-2">
        <div
          className={`flex h-11 items-center gap-2 px-2 ${sidebarCollapsed ? "justify-center" : ""}`}
        >
          <span className="size-3.5 rounded-[3px] bg-(--fg-primary)" />
          <strong
            className={`text-[13px] font-semibold ${sidebarCollapsed ? "hidden" : "max-md:hidden"}`}
          >
            Lenso
          </strong>
        </div>
        <WorkspaceSwitcher
          active={activeWorkspace}
          collapsed={sidebarCollapsed}
          locale={locale}
          onSelect={selectWorkspace}
          workspaces={navigation}
        />
        <div
          className={`px-2 pt-1 text-[10px] text-(--fg-tertiary) ${sidebarCollapsed ? "hidden" : "max-md:hidden"}`}
        >
          {copy.production}
        </div>
        <nav className="mt-1 grid gap-0.5">
          {activeWorkspace.id === SYSTEM_WORKSPACE.id ? (
            hostPrimaryNavItems.map((item) => (
              <NavItem
                item={{ ...item, label: copy.nav[navKey(item.path)] }}
                collapsed={sidebarCollapsed}
                key={item.path}
                locale={locale}
              />
            ))
          ) : (
            <WorkspaceMenu
              collapsed={sidebarCollapsed}
              locale={locale}
              workspace={activeWorkspace}
            />
          )}
        </nav>
        <div className="mt-auto">
          <Link
            activeProps={{
              className: "bg-(--bg-row-hover) text-(--fg-primary)",
            }}
            className={`flex h-8 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[12px] text-(--fg-secondary) hover:bg-(--bg-row-hover) hover:text-(--fg-primary) ${sidebarCollapsed ? "justify-center" : ""}`}
            to={"/settings" as never}
          >
            <span className="grid size-4 place-items-center">
              <Settings size={14} />
            </span>
            <span className={sidebarCollapsed ? "hidden" : "max-md:hidden"}>
              {copy.nav.settings}
            </span>
            <span
              className={`ml-auto font-mono text-[10px] text-(--fg-tertiary) ${sidebarCollapsed ? "hidden" : "max-md:hidden"}`}
            >
              G ,
            </span>
          </Link>
          <div
            className={`flex h-10 items-center gap-2 px-2 ${sidebarCollapsed ? "justify-center" : ""}`}
          >
            <span className="size-5 rounded-full border border-(--line-strong)" />
            <span className={sidebarCollapsed ? "hidden" : "max-md:hidden"}>
              <strong className="block text-[11px] font-medium">
                leosouthey&apos;s team
              </strong>
              <span className="block text-[10px] text-(--fg-tertiary)">
                {copy.operator}
              </span>
            </span>
          </div>
        </div>
      </aside>
      <main className="min-w-0">
        <header className="flex h-12 items-center border-b border-(--line) bg-(--bg-chrome) px-8">
          <div className="text-[11px] text-(--fg-tertiary)">
            {[
              copy.workspace,
              ...workspaceBreadcrumb(
                activeWorkspace,
                currentPath,
                copy.nav,
                locale
              ),
            ].map((part, index) => (
              <span key={`${part}-${index}`}>
                {index > 0 ? <span className="px-1">/</span> : null}
                <span
                  className={index > 0 ? "text-(--fg-secondary)" : undefined}
                >
                  {part}
                </span>
              </span>
            ))}
          </div>
          <button
            className="ml-auto flex h-7 w-[210px] items-center rounded-[var(--radius-control)] border border-(--line-strong) px-2 text-[11px] text-(--fg-tertiary) hover:bg-(--bg-control-hover)"
            onClick={openCommandPalette}
            type="button"
          >
            <Search size={12} />
            <span className="ml-5">{copy.search}</span>
            <span className="ml-auto font-mono">⌘ K</span>
          </button>
          <span className="ml-3 text-[11px] text-(--fg-tertiary)">
            {copy.updated}
          </span>
        </header>
        <div className="h-[calc(100vh-48px)] overflow-hidden">{children}</div>
      </main>
      <RetryDialog />
      <CommandPalette onToggleTheme={toggleTheme} theme={appearance.theme} />
    </div>
  );
}

function WorkspaceSwitcher({
  active,
  collapsed,
  locale,
  onSelect,
  workspaces,
}: {
  active: ConsoleWorkspaceNavigation;
  collapsed: boolean;
  locale: ConsoleLocale;
  onSelect: (workspace: ConsoleWorkspaceNavigation) => void;
  workspaces: ConsoleWorkspaceNavigation[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const Icon = iconForName(active.icon) ?? ServerCog;
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="relative" ref={root}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-9 w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-[13px] font-medium hover:bg-(--bg-row-hover) ${collapsed ? "justify-center" : ""}`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span
          className={`size-4 place-items-center ${collapsed ? "grid" : "hidden max-md:grid"}`}
        >
          <Icon size={14} />
        </span>
        <span className={collapsed ? "hidden" : "max-md:hidden"}>
          {consoleLocalizedLabel(active, locale)}
        </span>
        <ChevronDown
          className={collapsed ? "hidden" : "ml-auto max-md:hidden"}
          size={12}
        />
      </button>
      {open ? (
        <div
          className={`absolute top-10 z-50 w-[208px] rounded-[8px] border border-(--line-strong) bg-(--bg-overlay) p-1 shadow-(--elevation-overlay) ${collapsed ? "left-12" : "left-0"}`}
          role="menu"
        >
          <div className="flex h-6 items-center px-2 text-[10px] text-(--fg-tertiary)">
            {locale === "zh-CN" ? "工作区" : "Workspaces"}
          </div>
          {workspaces.map((workspace) => {
            const WorkspaceIcon =
              iconForName(workspace.icon) ?? LayoutDashboard;
            const count =
              workspace.items.length +
              workspace.groups.reduce(
                (sum, group) => sum + group.items.length,
                0
              );
            return (
              <button
                className={`grid h-8 w-full grid-cols-[16px_minmax(0,1fr)_16px] items-center gap-2 rounded-[var(--radius-control)] px-2 text-left hover:bg-(--bg-row-hover) ${workspace.id === active.id ? "bg-(--bg-row-hover)" : ""}`}
                key={workspace.id}
                onClick={() => {
                  onSelect(workspace);
                  setOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                <span className="grid size-4 place-items-center">
                  <WorkspaceIcon size={14} />
                </span>
                <strong className="truncate text-[12px] font-medium">
                  {consoleLocalizedLabel(workspace, locale)}
                </strong>
                <span className="grid size-4 place-items-center">
                  {workspace.id === active.id ? (
                    <Check size={12} />
                  ) : (
                    <span className="font-mono text-[10px] text-(--fg-tertiary)">
                      {count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <div className="my-1 h-px bg-(--line)" />
          <Link
            className="grid h-[42px] w-full grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-control)] px-2 hover:bg-(--bg-row-hover)"
            onClick={() => setOpen(false)}
            to={"/modules" as never}
          >
            <span className="grid size-4 place-items-center">
              <Boxes size={14} />
            </span>
            <span>
              <strong className="block text-[12px] font-medium">
                {locale === "zh-CN" ? "模块" : "Modules"}
              </strong>
              <span className="block text-[10px] text-(--fg-tertiary)">
                {locale === "zh-CN" ? "模块管理" : "Module management"}
              </span>
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceMenu({
  collapsed,
  locale,
  workspace,
}: {
  collapsed: boolean;
  locale: ConsoleLocale;
  workspace: ConsoleWorkspaceNavigation;
}) {
  return (
    <>
      {workspace.items.map((item) => (
        <NavItem
          collapsed={collapsed}
          item={item}
          key={item.path}
          locale={locale}
        />
      ))}
      {workspace.groups.map((group) => (
        <div key={group.id}>
          <div
            className={`px-2 pt-3 pb-1 text-[10px] font-medium text-(--fg-tertiary) ${collapsed ? "hidden" : "max-md:hidden"}`}
          >
            {consoleLocalizedLabel(group, locale)}
          </div>
          {group.items.map((item) => (
            <NavItem
              collapsed={collapsed}
              item={item}
              key={item.path}
              locale={locale}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function NavItem({
  collapsed = false,
  item,
  locale,
}: {
  collapsed?: boolean;
  item: ConsoleNavigationItem;
  locale: ConsoleLocale;
}) {
  const Icon = iconForName(item.icon) ?? Activity;
  const label = consoleLocalizedLabel(item, locale);
  return (
    <Link
      activeOptions={{ exact: item.path === "/" }}
      activeProps={{ className: "bg-(--bg-row-hover) text-(--fg-primary)" }}
      aria-label={collapsed ? label : undefined}
      className={`flex h-8 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[12px] text-(--fg-secondary) hover:bg-(--bg-row-hover) hover:text-(--fg-primary) ${collapsed ? "justify-center" : ""}`}
      to={item.path}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        <Icon size={14} strokeWidth={1.6} />
      </span>
      <span
        className={`min-w-0 truncate ${collapsed ? "hidden" : "max-md:hidden"}`}
      >
        {label}
      </span>
      <span
        className={`ml-auto font-mono text-[10px] text-(--fg-tertiary) ${collapsed ? "hidden" : "max-md:hidden"}`}
      >
        {shortcut(item.path)}
      </span>
    </Link>
  );
}

function hostItem(
  icon: ConsoleSurfaceIcon,
  label: string,
  path: string,
  order: number
): ConsoleNavigationItem {
  return {
    icon,
    label,
    moduleId: "host",
    navigation: { order, workspace: SYSTEM_WORKSPACE },
    path,
  };
}
function iconForName(icon?: string): ShellIcon | undefined {
  return icon
    ? namedIconRegistry[
        icon
          .trim()
          .replaceAll(/([a-z])([A-Z])/g, "$1-$2")
          .replaceAll(/[\s_]+/g, "-")
          .toLowerCase()
      ]
    : undefined;
}
function navKey(path: string): keyof ReturnType<typeof consoleCopy>["nav"] {
  return path === "/"
    ? "home"
    : (path.slice(1) as keyof ReturnType<typeof consoleCopy>["nav"]);
}
function routeLabel(
  path: string,
  fallback: string,
  nav: ReturnType<typeof consoleCopy>["nav"]
) {
  const hostKey = path === "/" ? "home" : path.slice(1);
  if (hostKey in nav) {
    return nav[hostKey as keyof typeof nav];
  }
  const segment = path.split("/").findLast(Boolean);
  return path === "/" ? "Home" : (segment?.replaceAll("-", " ") ?? fallback);
}
function workspaceBreadcrumb(
  workspace: ConsoleWorkspaceNavigation,
  path: string,
  nav: ReturnType<typeof consoleCopy>["nav"],
  locale: ConsoleLocale
) {
  if (workspace.id === SYSTEM_WORKSPACE.id) {
    return [routeLabel(path, workspace.label, nav)];
  }
  const directItem = workspace.items.find((item) => item.path === path);
  if (directItem) {
    return [
      consoleLocalizedLabel(workspace, locale),
      consoleLocalizedLabel(directItem, locale),
    ];
  }
  for (const group of workspace.groups) {
    const item = group.items.find((candidate) => candidate.path === path);
    if (item) {
      return [
        consoleLocalizedLabel(workspace, locale),
        consoleLocalizedLabel(group, locale),
        consoleLocalizedLabel(item, locale),
      ];
    }
  }
  return [
    consoleLocalizedLabel(workspace, locale),
    routeLabel(path, workspace.label, nav),
  ];
}
function shortcut(path: string) {
  const key =
    path === "/"
      ? "H"
      : path === "/system"
        ? "S"
        : path === "/modules"
          ? "M"
          : path === "/changes"
            ? "C"
            : path === "/runtime"
              ? "R"
              : path === "/stories"
                ? "T"
                : path === "/delivery"
                  ? "D"
                  : "";
  return key ? `G ${key}` : "";
}
