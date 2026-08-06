import type {
  ConsoleUiCompositionContext,
  ConsoleUiNavigationModel,
} from "@lenso/console-composition-api";
import {
  consoleLocalizedLabel,
  IconSlot,
  mergeStyleProps,
  SurfaceGroupLabel,
  styles,
  type ConsoleLocale,
  useConsoleLocale,
} from "@lenso/console-ui";
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

const shellActiveLinkClassName = mergeStyleProps(
  undefined,
  undefined,
  styles.shellNavLinkActive
).className;

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
  const compositionNavigation = useMemo<ConsoleUiNavigationModel>(() => {
    const model: ConsoleUiNavigationModel = {
      items: navigation
        .flatMap((workspace) => [
          ...workspace.items,
          ...workspace.groups.flatMap((group) => group.items),
        ])
        .map((item) => ({
          id: `${item.moduleId}:${item.path}`,
          path: item.path,
          label: consoleLocalizedLabel(item, locale),
          ...(item.navigation?.group
            ? { group: item.navigation.group.id }
            : {}),
          ...(item.navigation?.order === undefined
            ? {}
            : { order: item.navigation.order }),
          ...(item.icon ? { icon: item.icon } : {}),
        })),
    };
    const arrange = appearance.composition?.arrangeNavigation;
    if (!arrange) {
      return model;
    }
    try {
      return arrange(model);
    } catch {
      return model;
    }
  }, [appearance.composition, locale, navigation]);
  const compositionContext = useMemo<ConsoleUiCompositionContext>(
    () => ({
      bundleId: appearance.bundleId ?? "lenso/default",
      variantId: appearance.variantId ?? "default",
      navigation: compositionNavigation,
      slots: {
        root: null,
        shell: null,
        navigation: null,
        workspaceSwitcher: null,
        header: null,
        content: children,
        loading: null,
        error: null,
      },
    }),
    [appearance.bundleId, appearance.variantId, children, compositionNavigation]
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

  const defaultShell = (
    <div
      {...mergeStyleProps(
        undefined,
        "console-shell",
        styles.shell,
        sidebarCollapsed ? styles.shellCollapsed : styles.shellExpanded
      )}
    >
      <a
        {...mergeStyleProps(undefined, "console-skip-link", styles.skipLink)}
        href="#console-main"
      >
        {locale === "zh-CN" ? "跳转到主要内容" : "Skip to main content"}
      </a>
      <aside {...mergeStyleProps(undefined, undefined, styles.shellSidebar)}>
        <div
          {...mergeStyleProps(
            undefined,
            undefined,
            styles.shellBrand,
            sidebarCollapsed ? styles.shellBrandCollapsed : null
          )}
        >
          <span
            {...mergeStyleProps(undefined, undefined, styles.shellBrandMark)}
          />
          <strong
            {...mergeStyleProps(
              undefined,
              undefined,
              styles.shellBrandName,
              sidebarCollapsed
                ? styles.shellCollapsedOnly
                : styles.shellExpandedOnly
            )}
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
          {...mergeStyleProps(
            undefined,
            undefined,
            styles.shellProduction,
            sidebarCollapsed
              ? styles.shellCollapsedOnly
              : styles.shellExpandedOnly
          )}
        >
          {copy.production}
        </div>
        <nav {...mergeStyleProps(undefined, undefined, styles.shellNav)}>
          <WorkspaceMenu
            collapsed={sidebarCollapsed}
            locale={locale}
            workspace={activeWorkspace}
          />
        </nav>
        <div {...mergeStyleProps(undefined, undefined, styles.shellBottom)}>
          <Link
            activeProps={{
              className: shellActiveLinkClassName,
            }}
            className={
              mergeStyleProps(
                undefined,
                undefined,
                styles.shellNavLink,
                sidebarCollapsed ? styles.shellNavLinkCollapsed : null
              ).className
            }
            to={"/settings" as never}
          >
            <IconSlot>
              <Settings size={16} strokeWidth={1.6} />
            </IconSlot>
            <span
              className={
                mergeStyleProps(
                  undefined,
                  undefined,
                  sidebarCollapsed
                    ? styles.shellCollapsedOnly
                    : styles.shellExpandedOnly
                ).className
              }
            >
              {copy.nav.settings}
            </span>
            <span
              className={
                mergeStyleProps(
                  undefined,
                  undefined,
                  styles.shellShortcut,
                  sidebarCollapsed
                    ? styles.shellCollapsedOnly
                    : styles.shellExpandedOnly
                ).className
              }
            >
              {shortcut("/settings")}
            </span>
          </Link>
          <div
            {...mergeStyleProps(
              undefined,
              undefined,
              styles.shellProfile,
              sidebarCollapsed ? styles.shellProfileCollapsed : null
            )}
          >
            <span
              {...mergeStyleProps(undefined, undefined, styles.shellAvatar)}
            />
            <span
              className={
                mergeStyleProps(
                  undefined,
                  undefined,
                  styles.shellProfileCopy,
                  sidebarCollapsed
                    ? styles.shellCollapsedOnly
                    : styles.shellExpandedOnly
                ).className
              }
            >
              <strong
                {...mergeStyleProps(
                  undefined,
                  undefined,
                  styles.shellProfileName
                )}
              >
                Leo&apos;s team
              </strong>
              <span
                {...mergeStyleProps(
                  undefined,
                  undefined,
                  styles.shellProfileRole
                )}
              >
                {copy.operator}
              </span>
            </span>
          </div>
        </div>
      </aside>
      <main
        {...mergeStyleProps(undefined, undefined, styles.shellMain)}
        id="console-main"
        tabIndex={-1}
      >
        <header {...mergeStyleProps(undefined, undefined, styles.shellToolbar)}>
          <div
            {...mergeStyleProps(undefined, undefined, styles.shellBreadcrumb)}
          >
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
                {index > 0 ? (
                  <span
                    {...mergeStyleProps(
                      undefined,
                      undefined,
                      styles.shellBreadcrumbSeparator
                    )}
                  >
                    /
                  </span>
                ) : null}
                <span>{part}</span>
              </span>
            ))}
          </div>
          <button
            aria-label={`${copy.search} ⌘ K`}
            {...mergeStyleProps(undefined, undefined, styles.shellSearch)}
            onClick={openCommandPalette}
            type="button"
          >
            <Search size={12} />
            <span
              {...mergeStyleProps(
                undefined,
                undefined,
                styles.shellSearchLabel
              )}
            >
              {copy.search}
            </span>
            <span
              {...mergeStyleProps(
                undefined,
                undefined,
                styles.shellSearchShortcut
              )}
            >
              ⌘ K
            </span>
          </button>
          <span {...mergeStyleProps(undefined, undefined, styles.shellUpdated)}>
            {copy.updated}
          </span>
        </header>
        <div {...mergeStyleProps(undefined, undefined, styles.shellContent)}>
          {children}
        </div>
      </main>
      <RetryDialog />
      <CommandPalette onToggleTheme={toggleTheme} theme={appearance.theme} />
    </div>
  );
  const ShellComposition = appearance.composition?.slots?.shell;
  return ShellComposition ? (
    <ShellComposition context={compositionContext}>
      {defaultShell}
    </ShellComposition>
  ) : (
    defaultShell
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
    <div
      {...mergeStyleProps(undefined, undefined, styles.workspaceRoot)}
      ref={root}
    >
      <button
        aria-label={consoleLocalizedLabel(active, locale)}
        aria-controls="console-workspace-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        {...mergeStyleProps(
          undefined,
          undefined,
          styles.workspaceTrigger,
          collapsed ? styles.workspaceTriggerCollapsed : null
        )}
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
        <span
          {...mergeStyleProps(
            undefined,
            undefined,
            styles.workspaceTriggerLabel,
            collapsed ? styles.shellCollapsedOnly : styles.shellExpandedOnly
          )}
        >
          {consoleLocalizedLabel(active, locale)}
        </span>
        <ChevronDown
          {...mergeStyleProps(
            undefined,
            undefined,
            styles.workspaceTriggerChevron,
            collapsed ? styles.shellCollapsedOnly : styles.shellExpandedOnly
          )}
          size={12}
        />
      </button>
      {menuMounted ? (
        <div
          aria-hidden={!open}
          aria-labelledby="console-workspace-trigger"
          {...mergeStyleProps(
            undefined,
            "workspace-switcher-menu",
            styles.workspaceMenu,
            menuVisible ? styles.workspaceMenuVisible : null,
            collapsed ? styles.workspaceMenuCollapsed : null
          )}
          data-open={menuVisible}
          id="console-workspace-menu"
          role="menu"
        >
          <div
            {...mergeStyleProps(
              undefined,
              undefined,
              styles.workspaceMenuLabel
            )}
          >
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
                {...mergeStyleProps(
                  undefined,
                  undefined,
                  styles.workspaceMenuItem,
                  workspace.id === active.id
                    ? styles.workspaceMenuItemActive
                    : null
                )}
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
                <strong
                  {...mergeStyleProps(
                    undefined,
                    undefined,
                    styles.workspaceMenuItemTitle
                  )}
                >
                  {consoleLocalizedLabel(workspace, locale)}
                </strong>
                <span
                  {...mergeStyleProps(
                    undefined,
                    undefined,
                    styles.workspaceMenuItemCount
                  )}
                >
                  {workspace.id === active.id ? (
                    <Check size={12} />
                  ) : (
                    <span
                      {...mergeStyleProps(
                        undefined,
                        undefined,
                        styles.workspaceMenuItemCountText
                      )}
                    >
                      {count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <div
            {...mergeStyleProps(
              undefined,
              undefined,
              styles.workspaceMenuDivider
            )}
          />
          <Link
            {...mergeStyleProps(
              undefined,
              undefined,
              styles.workspaceMenuModules
            )}
            onClick={closeMenu}
            to={"/modules" as never}
          >
            <IconSlot>
              <Boxes size={14} />
            </IconSlot>
            <span>
              <strong
                {...mergeStyleProps(
                  undefined,
                  undefined,
                  styles.workspaceMenuModulesTitle
                )}
              >
                {locale === "zh-CN" ? "模块" : "Modules"}
              </strong>
              <span
                {...mergeStyleProps(
                  undefined,
                  undefined,
                  styles.workspaceMenuModulesDescription
                )}
              >
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
    <div {...mergeStyleProps(undefined, undefined, styles.shellNavGroup)}>
      <SurfaceGroupLabel
        className={
          mergeStyleProps(
            undefined,
            undefined,
            collapsed ? styles.shellCollapsedOnly : styles.shellExpandedOnly
          ).className
        }
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
        className: shellActiveLinkClassName,
      }}
      aria-label={label}
      className={
        mergeStyleProps(
          undefined,
          undefined,
          styles.shellNavLink,
          collapsed ? styles.shellNavLinkCollapsed : null
        ).className
      }
      to={item.path}
    >
      <IconSlot>
        <Icon size={16} strokeWidth={1.6} />
      </IconSlot>
      <span
        {...mergeStyleProps(
          undefined,
          undefined,
          styles.shellNavLabel,
          collapsed ? styles.shellCollapsedOnly : styles.shellExpandedOnly
        )}
      >
        {label}
      </span>
      <span
        {...mergeStyleProps(
          undefined,
          undefined,
          styles.shellShortcut,
          collapsed ? styles.shellCollapsedOnly : styles.shellExpandedOnly
        )}
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
