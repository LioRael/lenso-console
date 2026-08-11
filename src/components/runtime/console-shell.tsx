import type {
  ConsoleUiCompositionContext,
  ConsoleUiNavigationModel,
} from "@lenso/console-composition-api";
import { tokens } from "@lenso/console-tokens/tokens.stylex";
import {
  consoleLocalizedLabel,
  IconSlot,
  SurfaceGroupLabel,
  type ConsoleLocale,
  useConsoleLocale,
} from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
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
  SunMoon,
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
import { ConsoleCompositionErrorBoundary } from "../../app/console-composition-boundary";
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

export const shellStyles = stylex.create({
  shell: {
    backgroundColor: tokens.canvas,
    color: tokens.foreground,
    display: "grid",
    minHeight: "100vh",
  },
  shellExpanded: {
    gridTemplateColumns:
      "var(--lenso-token-sidebarWidth, 224px) minmax(0, 1fr)",
    "@media (max-width: 1100px)": {
      gridTemplateColumns:
        "var(--lenso-token-sidebarCollapsedWidth, 64px) minmax(0, 1fr)",
    },
  },
  shellCollapsed: {
    gridTemplateColumns:
      "var(--lenso-token-sidebarCollapsedWidth, 64px) minmax(0, 1fr)",
  },
  shellSidebar: {
    backgroundColor: tokens.sidebar,
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    paddingBlockEnd: 16,
    paddingBlockStart: 20,
    paddingInline: 8,
    position: "sticky",
    top: 0,
    zIndex: 30,
  },
  shellBrand: {
    alignItems: "center",
    display: "flex",
    gap: 10,
    height: 32,
    paddingInline: 10,
  },
  shellBrandCollapsed: { justifyContent: "center" },
  shellBrandMark: {
    backgroundColor: tokens.foreground,
    borderRadius: 3,
    flex: "none",
    height: 14,
    width: 14,
  },
  shellBrandName: {
    color: tokens.foreground,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: "20px",
  },
  shellCollapsedOnly: { display: "none" },
  shellExpandedOnly: {
    "@media (max-width: 1100px)": { display: "none" },
  },
  shellProduction: {
    alignItems: "center",
    color: tokens.foregroundTertiary,
    display: "flex",
    fontSize: 10,
    fontWeight: 600,
    height: 32,
    lineHeight: "14px",
    paddingInline: 10,
  },
  shellNav: { display: "grid", gap: 2, marginBlockStart: 2 },
  shellNavGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  shellNavLink: {
    alignItems: "center",
    borderRadius: tokens.radiusControl,
    color: tokens.foregroundSecondary,
    display: "flex",
    fontSize: 12,
    gap: 7,
    height: 32,
    lineHeight: "16px",
    paddingInline: 10,
    textDecoration: "none",
    transitionDuration: "120ms",
    transitionProperty: "background-color, color",
    transitionTimingFunction: "ease",
    ":hover": {
      backgroundColor: tokens.rowHover,
      color: tokens.foreground,
    },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  shellNavLinkCollapsed: { justifyContent: "center" },
  shellNavLinkActive: {
    backgroundColor: tokens.rowSelected,
    color: tokens.foreground,
    fontWeight: 500,
  },
  shellNavLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shellShortcut: {
    color: tokens.foregroundTertiary,
    fontSize: 11,
    fontWeight: 400,
    lineHeight: "16px",
    marginInlineStart: "auto",
  },
  shellBottom: { marginBlockStart: "auto", position: "relative" },
  shellProfile: {
    alignItems: "center",
    display: "flex",
    gap: 10,
    height: 40,
    paddingInlineStart: 10,
  },
  shellProfileCollapsed: { justifyContent: "center" },
  shellAvatar: {
    borderColor: tokens.lineStrong,
    borderRadius: tokens.radiusPill,
    borderStyle: "solid",
    borderWidth: 1,
    flex: "none",
    height: 20,
    width: 20,
  },
  shellProfileCopy: { minWidth: 0 },
  shellProfileName: {
    color: tokens.foregroundSecondary,
    display: "block",
    fontSize: 11,
    fontWeight: 500,
    lineHeight: "16px",
  },
  shellProfileRole: {
    color: tokens.foregroundTertiary,
    display: "block",
    fontSize: 10,
    lineHeight: "14px",
  },
  shellThemeButton: {
    alignItems: "center",
    backgroundColor: tokens.rowSelected,
    borderRadius: tokens.radiusControl,
    color: tokens.foregroundSecondary,
    display: "flex",
    height: 28,
    justifyContent: "center",
    marginInlineStart: "auto",
    width: 28,
    ":hover": {
      backgroundColor: tokens.rowHover,
      color: tokens.foreground,
    },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  shellAppearanceMenu: {
    backgroundColor: tokens.overlay,
    borderColor: tokens.lineStrong,
    borderRadius: tokens.radiusPanel,
    borderStyle: "solid",
    borderWidth: 1,
    bottom: 6,
    boxShadow: tokens.shadowOverlay,
    display: "grid",
    left: 224,
    padding: 8,
    position: "absolute",
    width: 248,
    zIndex: 60,
  },
  shellAppearanceMenuCollapsed: { left: 64 },
  shellAppearanceChoice: {
    alignItems: "center",
    borderRadius: 4,
    color: tokens.foreground,
    display: "flex",
    fontFamily: "inherit",
    fontSize: 11,
    height: 32,
    justifyContent: "space-between",
    lineHeight: "14px",
    paddingInline: 8,
    textDecoration: "none",
    width: "100%",
    ":hover": { backgroundColor: tokens.rowHover },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: -2,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  shellAppearanceChoiceSelected: {
    backgroundColor: tokens.rowSelected,
    fontWeight: 500,
  },
  shellAppearanceDivider: {
    borderTopColor: tokens.lineSubtle,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    height: 7,
    marginBlockStart: 6,
  },
  shellAppearanceMeta: {
    alignItems: "center",
    color: tokens.foregroundTertiary,
    display: "flex",
    fontSize: 11,
    height: 32,
    justifyContent: "space-between",
    paddingInline: 8,
  },
  shellAppearanceMetaValue: {
    color: tokens.foregroundSecondary,
    fontSize: 10,
  },
  shellMain: { minWidth: 0 },
  shellToolbar: {
    alignItems: "center",
    backgroundColor: tokens.window,
    borderBottomColor: tokens.lineSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    height: tokens.toolbarHeight,
    paddingInline: tokens.pageGutter,
  },
  shellBreadcrumb: {
    color: tokens.foregroundTertiary,
    fontSize: 11,
    lineHeight: "16px",
  },
  shellBreadcrumbSeparator: { paddingInline: 4 },
  shellSearch: {
    alignItems: "center",
    backgroundColor: tokens.control,
    borderColor: tokens.line,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.foregroundTertiary,
    display: "flex",
    fontFamily: "inherit",
    fontSize: 11,
    gap: 0,
    height: 28,
    marginInlineStart: "auto",
    paddingInline: 8,
    transitionDuration: "120ms",
    transitionProperty: "background-color, border-color",
    transitionTimingFunction: "ease",
    width: 209,
    ":hover": { backgroundColor: tokens.controlHover },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  shellSearchLabel: { marginInlineStart: 20 },
  shellSearchShortcut: {
    fontFamily: tokens.fontCode,
    marginInlineStart: "auto",
  },
  shellUpdated: {
    color: tokens.foregroundTertiary,
    fontSize: 11,
    marginInlineStart: 12,
  },
  shellContent: { height: "calc(100vh - 48px)", overflow: "hidden" },
  skipLink: {
    backgroundColor: tokens.overlay,
    borderColor: tokens.lineStrong,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.foreground,
    fontSize: 12,
    left: 8,
    paddingBlock: 8,
    paddingInline: 12,
    position: "fixed",
    top: 8,
    transform: "translateY(-160%)",
    transitionDuration: "120ms",
    transitionProperty: "transform",
    transitionTimingFunction: "ease",
    zIndex: 100,
    ":focus-visible": { transform: "translateY(0)" },
  },
  workspaceRoot: { position: "relative" },
  workspaceTrigger: {
    alignItems: "center",
    borderRadius: tokens.radiusControl,
    color: tokens.foregroundSecondary,
    display: "flex",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 500,
    gap: tokens.space2,
    height: 36,
    lineHeight: "16px",
    paddingInline: 10,
    textAlign: "left",
    width: "100%",
    ":hover": { backgroundColor: tokens.rowHover },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  workspaceTriggerCollapsed: { justifyContent: "center" },
  workspaceTriggerLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  workspaceTriggerChevron: { marginInlineStart: "auto" },
  workspaceMenu: {
    backgroundColor: tokens.overlay,
    borderColor: tokens.lineStrong,
    borderRadius: tokens.radiusPopover,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowOverlay,
    left: 0,
    opacity: 0,
    padding: 4,
    pointerEvents: "none",
    position: "absolute",
    top: 40,
    transform: "translateY(-4px) scale(0.985)",
    transformOrigin: "top left",
    transitionDuration: "140ms",
    transitionProperty: "opacity, transform",
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    width: 208,
    zIndex: 50,
    "@media (prefers-reduced-motion: reduce)": {
      transform: "none",
      transition: "none",
    },
  },
  workspaceMenuVisible: {
    opacity: 1,
    pointerEvents: "auto",
    transform: "translateY(0) scale(1)",
  },
  workspaceMenuCollapsed: { left: 48 },
  workspaceMenuLabel: {
    alignItems: "center",
    color: tokens.foregroundTertiary,
    display: "flex",
    fontSize: 10,
    height: 24,
    paddingInline: 8,
  },
  workspaceMenuItem: {
    alignItems: "center",
    borderRadius: tokens.radiusControl,
    display: "grid",
    fontFamily: "inherit",
    gap: tokens.space2,
    gridTemplateColumns: "16px minmax(0, 1fr) 16px",
    height: 32,
    paddingInline: 8,
    textAlign: "left",
    width: "100%",
    ":hover": { backgroundColor: tokens.rowHover },
    ":focus-visible": {
      outlineColor: tokens.focusRing,
      outlineOffset: -2,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  workspaceMenuItemActive: { backgroundColor: tokens.rowHover },
  workspaceMenuItemTitle: {
    fontSize: 12,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  workspaceMenuItemCount: {
    alignItems: "center",
    display: "grid",
    height: 16,
    justifyItems: "center",
    width: 16,
  },
  workspaceMenuItemCountText: {
    color: tokens.foregroundTertiary,
    fontFamily: tokens.fontCode,
    fontSize: 10,
  },
  workspaceMenuDivider: {
    backgroundColor: tokens.line,
    height: 1,
    marginBlock: 4,
  },
  workspaceMenuModules: {
    alignItems: "center",
    borderRadius: tokens.radiusControl,
    display: "grid",
    gap: tokens.space2,
    gridTemplateColumns: "16px minmax(0, 1fr)",
    height: 40,
    paddingInline: 8,
    textDecoration: "none",
    width: "100%",
    ":hover": { backgroundColor: tokens.rowHover },
  },
  workspaceMenuModulesTitle: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
  },
  workspaceMenuModulesDescription: {
    color: tokens.foregroundTertiary,
    display: "block",
    fontSize: 10,
  },
});

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

const shellActiveLinkClassName = stylex.props(
  shellStyles.shellNavLinkActive
).className;

export function ConsoleShell({ children }: PropsWithChildren) {
  const { locale } = useConsoleLocale();
  const copy = consoleCopy(locale);
  const appearance = useConsoleAppearance();
  const handleCompositionError = appearance.recoverToOfficialDefault;
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
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const appearanceMenuRef = useRef<HTMLDivElement>(null);
  const activeWorkspace = selectedWorkspaceForId(
    navigation,
    routeWorkspaceId ?? selectedWorkspaceId
  );
  const { model: compositionNavigation, error: compositionNavigationError } =
    useMemo<{ model: ConsoleUiNavigationModel; error: unknown }>(() => {
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
        return { error: null, model };
      }
      try {
        return { error: null, model: arrange(model) };
      } catch (error: unknown) {
        return { error, model };
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
    if (compositionNavigationError !== null) {
      handleCompositionError(compositionNavigationError);
    }
  }, [compositionNavigationError, handleCompositionError]);

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

  useEffect(() => {
    if (!appearanceMenuOpen) {
      return;
    }
    const closeMenu = (event: MouseEvent) => {
      if (!appearanceMenuRef.current?.contains(event.target as Node)) {
        setAppearanceMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAppearanceMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [appearanceMenuOpen]);

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

  const shellStyleProps = stylex.props(
    shellStyles.shell,
    sidebarCollapsed ? shellStyles.shellCollapsed : shellStyles.shellExpanded
  );
  const skipLinkStyleProps = stylex.props(shellStyles.skipLink);

  const defaultShell = (
    <div {...shellStyleProps} data-ui="console-shell">
      <a
        {...skipLinkStyleProps}
        data-ui="console-skip-link"
        href="#console-main"
      >
        {locale === "zh-CN" ? "跳转到主要内容" : "Skip to main content"}
      </a>
      <aside {...stylex.props(shellStyles.shellSidebar)}>
        <div
          {...stylex.props(
            shellStyles.shellBrand,
            sidebarCollapsed ? shellStyles.shellBrandCollapsed : null
          )}
        >
          <span {...stylex.props(shellStyles.shellBrandMark)} />
          <strong
            {...stylex.props(
              shellStyles.shellBrandName,
              sidebarCollapsed
                ? shellStyles.shellCollapsedOnly
                : shellStyles.shellExpandedOnly
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
          {...stylex.props(
            shellStyles.shellProduction,
            sidebarCollapsed
              ? shellStyles.shellCollapsedOnly
              : shellStyles.shellExpandedOnly
          )}
        >
          {copy.production}
        </div>
        <nav {...stylex.props(shellStyles.shellNav)}>
          <WorkspaceMenu
            collapsed={sidebarCollapsed}
            locale={locale}
            workspace={activeWorkspace}
          />
        </nav>
        <div {...stylex.props(shellStyles.shellBottom)}>
          <Link
            activeProps={{
              className: shellActiveLinkClassName,
            }}
            className={
              stylex.props(
                shellStyles.shellNavLink,
                sidebarCollapsed ? shellStyles.shellNavLinkCollapsed : null
              ).className
            }
            to={"/settings" as never}
          >
            <IconSlot>
              <Settings size={16} strokeWidth={1.6} />
            </IconSlot>
            <span
              className={
                stylex.props(
                  sidebarCollapsed
                    ? shellStyles.shellCollapsedOnly
                    : shellStyles.shellExpandedOnly
                ).className
              }
            >
              {copy.nav.settings}
            </span>
            <span
              className={
                stylex.props(
                  shellStyles.shellShortcut,
                  sidebarCollapsed
                    ? shellStyles.shellCollapsedOnly
                    : shellStyles.shellExpandedOnly
                ).className
              }
            >
              {shortcut("/settings")}
            </span>
          </Link>
          <div
            ref={appearanceMenuRef}
            {...stylex.props(
              shellStyles.shellProfile,
              sidebarCollapsed ? shellStyles.shellProfileCollapsed : null
            )}
          >
            <span {...stylex.props(shellStyles.shellAvatar)} />
            <span
              className={
                stylex.props(
                  shellStyles.shellProfileCopy,
                  sidebarCollapsed
                    ? shellStyles.shellCollapsedOnly
                    : shellStyles.shellExpandedOnly
                ).className
              }
            >
              <strong {...stylex.props(shellStyles.shellProfileName)}>
                Leo&apos;s team
              </strong>
              <span {...stylex.props(shellStyles.shellProfileRole)}>
                {copy.operator}
              </span>
            </span>
            <button
              aria-expanded={appearanceMenuOpen}
              aria-haspopup="menu"
              aria-label={locale === "zh-CN" ? "切换主题" : "Change theme"}
              {...stylex.props(shellStyles.shellThemeButton)}
              onClick={() => setAppearanceMenuOpen((open) => !open)}
              type="button"
            >
              <SunMoon aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
            {appearanceMenuOpen ? (
              <AppearanceMenu
                appearance={appearance}
                collapsed={sidebarCollapsed}
                locale={locale}
                onClose={() => setAppearanceMenuOpen(false)}
              />
            ) : null}
          </div>
        </div>
      </aside>
      <main
        {...stylex.props(shellStyles.shellMain)}
        id="console-main"
        tabIndex={-1}
      >
        <header {...stylex.props(shellStyles.shellToolbar)}>
          <div {...stylex.props(shellStyles.shellBreadcrumb)}>
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
                  <span {...stylex.props(shellStyles.shellBreadcrumbSeparator)}>
                    /
                  </span>
                ) : null}
                <span>{part}</span>
              </span>
            ))}
          </div>
          <button
            aria-label={`${copy.search} ⌘ K`}
            {...stylex.props(shellStyles.shellSearch)}
            onClick={openCommandPalette}
            type="button"
          >
            <Search size={12} />
            <span {...stylex.props(shellStyles.shellSearchLabel)}>
              {copy.search}
            </span>
            <span {...stylex.props(shellStyles.shellSearchShortcut)}>⌘ K</span>
          </button>
          <span {...stylex.props(shellStyles.shellUpdated)}>
            {copy.updated}
          </span>
        </header>
        <div {...stylex.props(shellStyles.shellContent)}>{children}</div>
      </main>
      <RetryDialog />
      <CommandPalette onToggleTheme={toggleTheme} theme={appearance.theme} />
    </div>
  );
  const ShellComposition = appearance.composition?.slots?.shell;
  return ShellComposition ? (
    <ConsoleCompositionErrorBoundary
      fallback={defaultShell}
      key={`${appearance.bundleId}:${appearance.variantId}`}
      onError={handleCompositionError}
    >
      <ShellComposition context={compositionContext}>
        {defaultShell}
      </ShellComposition>
    </ConsoleCompositionErrorBoundary>
  ) : (
    defaultShell
  );
}

function AppearanceMenu({
  appearance,
  collapsed,
  locale,
  onClose,
}: {
  appearance: ReturnType<typeof useConsoleAppearance>;
  collapsed: boolean;
  locale: ConsoleLocale;
  onClose: () => void;
}) {
  const zh = locale === "zh-CN";
  const bundleName =
    appearance.themeBundles.find(
      (bundle) => bundle.bundleId === appearance.bundleId
    )?.manifest.displayName ?? (zh ? "默认 Console" : "Default Console");
  const choices = [
    { label: zh ? "跟随系统" : "System", value: "system" },
    { label: zh ? "浅色" : "Light", value: "light" },
    { label: zh ? "深色" : "Dark", value: "dark" },
  ] as const;

  return (
    <div
      {...stylex.props(
        shellStyles.shellAppearanceMenu,
        collapsed ? shellStyles.shellAppearanceMenuCollapsed : null
      )}
      aria-label={zh ? "外观" : "Appearance"}
      role="menu"
    >
      {choices.map((choice) => {
        const selected = appearance.preference === choice.value;
        return (
          <button
            aria-checked={selected}
            {...stylex.props(
              shellStyles.shellAppearanceChoice,
              selected ? shellStyles.shellAppearanceChoiceSelected : null
            )}
            key={choice.value}
            onClick={() => {
              appearance.setPreference(choice.value);
              onClose();
            }}
            role="menuitemradio"
            type="button"
          >
            <span>{choice.label}</span>
            {selected ? <Check aria-hidden="true" size={12} /> : null}
          </button>
        );
      })}
      <div {...stylex.props(shellStyles.shellAppearanceDivider)} />
      <div {...stylex.props(shellStyles.shellAppearanceMeta)}>
        <span>{zh ? "主题" : "Theme"}</span>
        <span {...stylex.props(shellStyles.shellAppearanceMetaValue)}>
          {bundleName}
        </span>
      </div>
      <Link
        {...stylex.props(shellStyles.shellAppearanceChoice)}
        onClick={onClose}
        role="menuitem"
        to="/settings/appearance"
      >
        {zh ? "外观设置…" : "Appearance settings…"}
      </Link>
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

  const workspaceMenuStyleProps = stylex.props(
    shellStyles.workspaceMenu,
    menuVisible ? shellStyles.workspaceMenuVisible : null,
    collapsed ? shellStyles.workspaceMenuCollapsed : null
  );

  return (
    <div {...stylex.props(shellStyles.workspaceRoot)} ref={root}>
      <button
        aria-label={consoleLocalizedLabel(active, locale)}
        aria-controls="console-workspace-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        {...stylex.props(
          shellStyles.workspaceTrigger,
          collapsed ? shellStyles.workspaceTriggerCollapsed : null
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
          {...stylex.props(
            shellStyles.workspaceTriggerLabel,
            collapsed
              ? shellStyles.shellCollapsedOnly
              : shellStyles.shellExpandedOnly
          )}
        >
          {consoleLocalizedLabel(active, locale)}
        </span>
        <ChevronDown
          {...stylex.props(
            shellStyles.workspaceTriggerChevron,
            collapsed
              ? shellStyles.shellCollapsedOnly
              : shellStyles.shellExpandedOnly
          )}
          size={12}
        />
      </button>
      {menuMounted ? (
        <div
          aria-hidden={!open}
          aria-labelledby="console-workspace-trigger"
          {...workspaceMenuStyleProps}
          data-ui="workspace-switcher-menu"
          data-open={menuVisible}
          id="console-workspace-menu"
          role="menu"
        >
          <div {...stylex.props(shellStyles.workspaceMenuLabel)}>
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
                {...stylex.props(
                  shellStyles.workspaceMenuItem,
                  workspace.id === active.id
                    ? shellStyles.workspaceMenuItemActive
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
                <strong {...stylex.props(shellStyles.workspaceMenuItemTitle)}>
                  {consoleLocalizedLabel(workspace, locale)}
                </strong>
                <span {...stylex.props(shellStyles.workspaceMenuItemCount)}>
                  {workspace.id === active.id ? (
                    <Check size={12} />
                  ) : (
                    <span
                      {...stylex.props(shellStyles.workspaceMenuItemCountText)}
                    >
                      {count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <div {...stylex.props(shellStyles.workspaceMenuDivider)} />
          <Link
            {...stylex.props(shellStyles.workspaceMenuModules)}
            onClick={closeMenu}
            to={"/modules" as never}
          >
            <IconSlot>
              <Boxes size={14} />
            </IconSlot>
            <span>
              <strong {...stylex.props(shellStyles.workspaceMenuModulesTitle)}>
                {locale === "zh-CN" ? "模块" : "Modules"}
              </strong>
              <span
                {...stylex.props(shellStyles.workspaceMenuModulesDescription)}
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
    <div {...stylex.props(shellStyles.shellNavGroup)}>
      <SurfaceGroupLabel
        icon={GroupIcon ? <GroupIcon size={12} strokeWidth={1.6} /> : undefined}
        label={consoleLocalizedLabel(group, locale)}
        stylex={
          collapsed
            ? shellStyles.shellCollapsedOnly
            : shellStyles.shellExpandedOnly
        }
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
        stylex.props(
          shellStyles.shellNavLink,
          collapsed ? shellStyles.shellNavLinkCollapsed : null
        ).className
      }
      to={item.path}
    >
      <IconSlot>
        <Icon size={16} strokeWidth={1.6} />
      </IconSlot>
      <span
        {...stylex.props(
          shellStyles.shellNavLabel,
          collapsed
            ? shellStyles.shellCollapsedOnly
            : shellStyles.shellExpandedOnly
        )}
      >
        {label}
      </span>
      <span
        {...stylex.props(
          shellStyles.shellShortcut,
          collapsed
            ? shellStyles.shellCollapsedOnly
            : shellStyles.shellExpandedOnly
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
    const directItem = workspace.items.find(
      (item) =>
        item.path === path ||
        (item.path !== "/" && path.startsWith(`${item.path}/`))
    );
    if (directItem?.path === "/system" || !directItem) {
      return [consoleLocalizedLabel(directItem ?? workspace, locale)];
    }
    return [
      consoleLocalizedLabel(workspace, locale),
      consoleLocalizedLabel(directItem, locale),
    ];
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
