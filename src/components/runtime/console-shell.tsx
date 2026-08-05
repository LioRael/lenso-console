import {
  consoleLocalizedLabel,
  IconSlot,
  SurfaceGroupLabel,
  type ConsoleLocale,
  useConsoleLocale,
} from "@lenso/console-ui-internal";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Blocks,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  Database,
  GitFork,
  GitCompareArrows,
  Globe,
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
  Smartphone,
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
  type KeyboardEvent as ReactKeyboardEvent,
  type PropsWithChildren,
} from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { useConsoleNavigation } from "../../app/console-module-metadata";
import type {
  ConsoleNavigationItem,
  ConsoleSurfaceIcon,
} from "../../app/console-modules";
import { consoleNavigation } from "../../app/console-modules";
import {
  buildWorkspaceNavigation,
  matchedWorkspaceIdForPath,
  selectedWorkspaceForId,
  SYSTEM_WORKSPACE,
  type ConsoleWorkspaceNavigation,
  type WorkspaceMenuNavigationKey,
  workspaceMenuIndexForKey,
} from "../../app/console-workspace-navigation";
import { consoleCopy } from "../../features/console-design/copy";
import { usePersistedLayout } from "../../hooks/use-persisted-layout";
import { CommandPalette } from "./command-palette";
import { useConsole } from "./console-context";
import { RetryDialog } from "./retry-dialog";

type ShellIcon = ComponentType<{ size?: number; strokeWidth?: number }>;

const iconRegistry = {
  activity: Activity,
  blocks: Blocks,
  boxes: Boxes,
  chrome: Globe,
  database: Database,
  "git-compare-arrows": GitCompareArrows,
  github: GitFork,
  house: House,
  "key-round": KeyRound,
  network: Network,
  rocket: Rocket,
  "server-cog": ServerCog,
  shield: Shield,
  settings: Settings,
  smartphone: Smartphone,
  users: Users,
  workflow: Workflow,
} satisfies Record<ConsoleSurfaceIcon, ShellIcon>;

const namedIconRegistry: Record<string, ShellIcon> = {
  ...iconRegistry,
  "building-2": Building2,
  handshake: Handshake,
  "layout-dashboard": LayoutDashboard,
};

export function ConsoleShell({ children }: PropsWithChildren) {
  const { locale } = useConsoleLocale();
  const copy = consoleCopy(locale);
  const appearance = useConsoleAppearance();
  const { openCommandPalette } = useConsole();
  const navigate = useNavigate();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const extensionNavigation = useConsoleNavigation();
  const navigation = useMemo(
    () =>
      buildWorkspaceNavigation(
        deduplicateNavigation([...consoleNavigation, ...extensionNavigation])
      ),
    [extensionNavigation]
  );
  const routeWorkspaceId = useMemo(
    () => matchedWorkspaceIdForPath(navigation, currentPath),
    [currentPath, navigation]
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = usePersistedLayout(
    "lenso-console:selected-workspace",
    SYSTEM_WORKSPACE.id
  );
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedLayout(
    "lenso-console:sidebar-collapsed",
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
      className={`console-shell grid min-h-screen bg-(--bg-canvas) text-(--fg-primary) ${sidebarCollapsed ? "grid-cols-[var(--console-sidebar-collapsed-width)_minmax(0,1fr)]" : "grid-cols-[var(--console-sidebar-width)_minmax(0,1fr)] max-[1100px]:grid-cols-[var(--console-sidebar-collapsed-width)_minmax(0,1fr)]"}`}
    >
      <a className="console-skip-link" href="#console-main">
        {locale === "zh-CN" ? "跳转到主要内容" : "Skip to main content"}
      </a>
      <aside className="sticky top-0 z-30 flex h-screen flex-col bg-(--bg-sidebar) px-2 pt-5 pb-4">
        <div
          className={`flex h-8 items-center gap-2.5 px-2.5 ${sidebarCollapsed ? "justify-center" : ""}`}
        >
          <span className="size-3.5 rounded-[3px] bg-(--fg-primary)" />
          <strong
            className={`text-[14px] font-semibold leading-5 ${sidebarCollapsed ? "hidden" : "max-[1100px]:hidden"}`}
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
          className={`flex h-8 items-center px-2.5 text-[10px] font-semibold leading-[14px] text-(--fg-tertiary) ${sidebarCollapsed ? "hidden" : "max-[1100px]:hidden"}`}
        >
          {copy.production}
        </div>
        <nav className="mt-0.5 grid gap-0.5">
          <WorkspaceMenu
            collapsed={sidebarCollapsed}
            locale={locale}
            workspace={activeWorkspace}
          />
        </nav>
        <div className="mt-auto">
          <Link
            activeProps={{
              className:
                "bg-(--bg-row-selected) text-(--fg-primary) font-medium",
            }}
            className={`flex h-8 items-center gap-[7px] rounded-[var(--radius-control)] px-2.5 text-[12px] leading-4 text-(--fg-secondary) hover:bg-(--bg-row-hover) hover:text-(--fg-primary) ${sidebarCollapsed ? "justify-center" : ""}`}
            to={"/settings" as never}
          >
            <IconSlot className="shrink-0">
              <Settings size={16} strokeWidth={1.6} />
            </IconSlot>
            <span
              className={sidebarCollapsed ? "hidden" : "max-[1100px]:hidden"}
            >
              {copy.nav.settings}
            </span>
            <span
              className={`ml-auto text-[11px] leading-4 font-normal text-(--fg-tertiary) ${sidebarCollapsed ? "hidden" : "max-[1100px]:hidden"}`}
            >
              {shortcut("/settings")}
            </span>
          </Link>
          <div
            className={`flex h-10 items-center gap-2.5 pl-2.5 ${sidebarCollapsed ? "justify-center" : ""}`}
          >
            <span className="size-5 shrink-0 rounded-full border border-(--line-strong)" />
            <span
              className={sidebarCollapsed ? "hidden" : "max-[1100px]:hidden"}
            >
              <strong className="block text-[11px] font-medium leading-4 text-(--fg-secondary)">
                Leo&apos;s team
              </strong>
              <span className="block text-[10px] leading-[14px] text-(--fg-tertiary)">
                {copy.operator}
              </span>
            </span>
          </div>
        </div>
      </aside>
      <main className="min-w-0" id="console-main" tabIndex={-1}>
        <header className="flex h-12 items-center border-b border-(--line-subtle) bg-(--bg-chrome) px-10">
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
                <span>{part}</span>
              </span>
            ))}
          </div>
          <button
            aria-label={`${copy.search} ⌘ K`}
            className="ml-auto flex h-7 w-[209px] items-center rounded-[var(--radius-control)] border border-(--line) px-2 text-[11px] text-(--fg-tertiary) hover:bg-(--bg-control-hover)"
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
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [focusedWorkspaceIndex, setFocusedWorkspaceIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const Icon = iconForName(active.icon) ?? ServerCog;
  const activeWorkspaceIndex = Math.max(
    0,
    workspaces.findIndex((workspace) => workspace.id === active.id)
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  useEffect(() => {
    if (open) {
      setMenuMounted(true);
      const frame = window.requestAnimationFrame(() => setMenuVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setMenuVisible(false);
    if (!menuMounted) {
      return;
    }
    const timeout = window.setTimeout(() => setMenuMounted(false), 140);
    return () => window.clearTimeout(timeout);
  }, [menuMounted, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFocusedWorkspaceIndex(activeWorkspaceIndex);
    const frame = window.requestAnimationFrame(() => {
      menuItemRefs.current[activeWorkspaceIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeWorkspaceIndex, open]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    if (!open) {
      return;
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [closeMenu, open]);

  const onWorkspaceKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const workspace = workspaces[index];
      if (workspace) {
        onSelect(workspace);
        closeMenu();
      }
      return;
    }
    if (!isWorkspaceMenuNavigationKey(event.key)) {
      return;
    }
    event.preventDefault();
    const nextIndex = workspaceMenuIndexForKey(
      index,
      event.key,
      workspaces.length
    );
    if (nextIndex === null) {
      return;
    }
    setFocusedWorkspaceIndex(nextIndex);
    menuItemRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="relative" ref={root}>
      <button
        aria-label={consoleLocalizedLabel(active, locale)}
        aria-controls="console-workspace-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-9 w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 text-[12px] font-medium leading-4 text-(--fg-secondary) hover:bg-(--bg-row-hover) ${collapsed ? "justify-center" : ""}`}
        id="console-workspace-trigger"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >
        {collapsed ? (
          <IconSlot>
            <Icon size={14} />
          </IconSlot>
        ) : null}
        <span className={collapsed ? "hidden" : "max-[1100px]:hidden"}>
          {consoleLocalizedLabel(active, locale)}
        </span>
        <ChevronDown
          className={collapsed ? "hidden" : "ml-auto max-[1100px]:hidden"}
          size={12}
        />
      </button>
      {menuMounted ? (
        <div
          aria-hidden={!open}
          aria-labelledby="console-workspace-trigger"
          className={`workspace-switcher-menu absolute top-10 z-50 w-[208px] rounded-[8px] border border-(--line-strong) bg-(--bg-overlay) p-1 shadow-(--elevation-overlay) ${collapsed ? "left-12" : "left-0"}`}
          data-open={menuVisible}
          id="console-workspace-menu"
          role="menu"
        >
          <div className="flex h-6 items-center px-2 text-[10px] text-(--fg-tertiary)">
            {locale === "zh-CN" ? "工作区" : "Workspaces"}
          </div>
          {workspaces.map((workspace, index) => {
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
                aria-checked={workspace.id === active.id}
                key={workspace.id}
                onClick={() => {
                  onSelect(workspace);
                  closeMenu();
                }}
                onKeyDown={(event) => onWorkspaceKeyDown(event, index)}
                ref={(element) => {
                  menuItemRefs.current[index] = element;
                }}
                role="menuitemradio"
                tabIndex={index === focusedWorkspaceIndex ? 0 : -1}
                type="button"
              >
                <IconSlot>
                  <WorkspaceIcon size={14} />
                </IconSlot>
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
            className="grid h-10 w-full grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-control)] px-2 hover:bg-(--bg-row-hover)"
            onClick={closeMenu}
            to={"/modules" as never}
          >
            <IconSlot>
              <Boxes size={14} />
            </IconSlot>
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
      {workspace.items
        .filter((item) => item.path !== "/settings")
        .map((item) => (
          <NavItem
            collapsed={collapsed}
            item={item}
            key={item.path}
            locale={locale}
          />
        ))}
      {workspace.groups.map((group) => (
        <WorkspaceMenuGroup
          collapsed={collapsed}
          group={group}
          key={group.id}
          locale={locale}
        />
      ))}
    </>
  );
}

function WorkspaceMenuGroup({
  collapsed,
  group,
  locale,
}: {
  collapsed: boolean;
  group: ConsoleWorkspaceNavigation["groups"][number];
  locale: ConsoleLocale;
}) {
  const GroupIcon = iconForName(group.icon);
  return (
    <div className="flex flex-col gap-0.5">
      <SurfaceGroupLabel
        className={collapsed ? "hidden" : "max-[1100px]:hidden"}
        icon={GroupIcon ? <GroupIcon size={12} strokeWidth={1.6} /> : undefined}
        label={consoleLocalizedLabel(group, locale)}
      />
      {group.items.map((item) => (
        <NavItem
          collapsed={collapsed}
          item={item}
          key={item.path}
          locale={locale}
        />
      ))}
    </div>
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
      activeOptions={{ exact: item.path === "/" || item.path === "/system" }}
      activeProps={{
        className: "bg-(--bg-row-selected) text-(--fg-primary) font-medium",
      }}
      aria-label={label}
      className={`flex h-8 items-center gap-[7px] rounded-[var(--radius-control)] px-2.5 text-[12px] leading-4 text-(--fg-secondary) hover:bg-(--bg-row-hover) hover:text-(--fg-primary) ${collapsed ? "justify-center" : ""}`}
      to={item.path}
    >
      <IconSlot className="shrink-0">
        <Icon size={16} strokeWidth={1.6} />
      </IconSlot>
      <span
        className={`min-w-0 truncate ${collapsed ? "hidden" : "max-[1100px]:hidden"}`}
      >
        {label}
      </span>
      <span
        className={`ml-auto text-[11px] leading-4 font-normal text-(--fg-tertiary) ${collapsed ? "hidden" : "max-[1100px]:hidden"}`}
      >
        {shortcut(item.path)}
      </span>
    </Link>
  );
}

function isWorkspaceMenuNavigationKey(
  key: string
): key is WorkspaceMenuNavigationKey {
  return (
    key === "ArrowDown" || key === "ArrowUp" || key === "End" || key === "Home"
  );
}

function deduplicateNavigation(
  items: readonly ConsoleNavigationItem[]
): ConsoleNavigationItem[] {
  const byPath = new Map<string, ConsoleNavigationItem>();
  for (const item of items) {
    if (!byPath.has(item.path)) {
      byPath.set(item.path, item);
    }
  }
  return [...byPath.values()];
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
function routeLabel(
  path: string,
  fallback: string,
  nav: ReturnType<typeof consoleCopy>["nav"]
) {
  const hostKey =
    path === "/" ? "home" : path === "/services" ? "services" : path.slice(1);
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
    const directItem = workspace.items.find((item) => item.path === path);
    return [consoleLocalizedLabel(directItem ?? workspace, locale)];
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
                  : path === "/services"
                    ? "V"
                    : path === "/settings"
                      ? ","
                      : "";
  return key ? `G ${key}` : "";
}
