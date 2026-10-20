// Share the scoped portal context across Vite prebundles.
import { ThemeScope, Tooltip } from "@lenso/ui";
import { Button } from "@lenso/ui/button";
import { Popover } from "@lenso/ui/popover";
import { Tabs } from "@lenso/ui/tabs";
import * as stylex from "@stylexjs/stylex";
import {
  Menu,
  Search,
  Settings2,
  PanelLeft,
  LayoutGrid,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Component,
  memo,
  useId,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";

import type {
  ConsoleDockViewReference,
  ConsoleLocalPageProps,
  ConsolePreferences,
  ConsolePreferenceStore,
  ConsoleRouterAdapter,
  ConsoleSessionAdapter,
  ConsoleSettingsOptions,
} from "./composition";
import {
  ConsoleActionHost,
  type ConsolePageContribution,
  type ConsoleTaskContext,
} from "./console-action-scope";
import { useConsoleActivation } from "./console-activation";
import { ConsoleCommand, useConsoleCommandFocus } from "./console-command";
import { ConsoleContextBar } from "./console-context-bar";
import { ConsoleDock, type ConsoleDockSelection } from "./console-dock";
import {
  useConsoleCommandKey,
  useConsoleLongPress,
} from "./console-dock-interactions";
import {
  consoleDockPresets,
  withConsoleDockPresets,
} from "./console-dock-presets";
import { ConsoleDockViewHost } from "./console-dock-view";
import { ConsoleIconButton } from "./console-icon-button";
import { ConsoleLayout, type ConsoleLayoutProps } from "./console-layout";
import {
  consoleRouteHref,
  createConsoleModel,
  defaultConsolePreferences,
  orderedConsolePins,
  visibleConsoleNavigation,
  visibleConsoleSettings,
  visibleConsoleDockViews,
  type ConsoleNavigationItem,
  type ConsoleRoute,
  type ConsoleShellBinding,
} from "./console-model";
import {
  ConsoleNavigationEditor,
  ConsolePresetSwitcher,
  ConsolePresetCollection,
} from "./console-navigation-editor";
import { useConsolePreferences } from "./console-preferences";
import {
  ConsoleSettingsContext,
  consoleSettingsBindingId,
  createConsoleSettingsBinding,
} from "./console-settings";
import { shellStyles as styles } from "./console-shell.styles";

export type ConsoleShellStatus =
  | "empty"
  | "not-found"
  | "error"
  | "forbidden"
  | "loading"
  | "authentication-required"
  | "unavailable";
export interface ConsoleShellProps {
  plugins: readonly ConsoleShellBinding[];
  router: ConsoleRouterAdapter;
  session?: ConsoleSessionAdapter;
  basePath?: string;
  navigationDefaults?: Partial<ConsolePreferences>;
  dock?: { leading: readonly ConsoleDockViewReference[] };
  /** Explicit installation; Plugins retain configuration UI and service ownership. */
  settings?: ConsoleSettingsOptions;
  preferences?: ConsolePreferenceStore;
  tabsPosition?: ConsolePreferences["position"] | "content";
  topEdge?: ConsoleLayoutProps["topEdge"];
  tableControls?: ConsoleLayoutProps["tableControls"];
  /** Also show the corner entry while the Dock already provides navigation. */
  navigationButton?: boolean;
  renderStatus?: (status: ConsoleShellStatus) => ReactNode;
  /** Host-owned layout contributions, such as an environment marker. */
  children?: ReactNode;
}
const statusLabels: Record<ConsoleShellStatus, string> = {
  empty: "No pages are installed.",
  "not-found": "Page not found.",
  error: "This page could not be displayed.",
  forbidden: "You do not have access to this page.",
  loading: "Loading Console.",
  "authentication-required": "Sign in to continue.",
  unavailable: "Console is unavailable.",
};
function subscribeNarrowSidebar(listener: () => void) {
  const query = window.matchMedia("(max-width: 640px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function narrowSidebarSnapshot() {
  return window.matchMedia("(max-width: 640px)").matches;
}
function Status({
  status,
  render,
}: {
  status: ConsoleShellStatus;
  render?: ConsoleShellProps["renderStatus"];
}) {
  return (
    <div role={status === "loading" ? "status" : undefined}>
      {render ? render(status) : statusLabels[status]}
    </div>
  );
}
class PageBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function interceptNavigation(
  event: MouseEvent<HTMLElement>,
  router: ConsoleRouterAdapter,
  href: string
) {
  if (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    event.preventDefault();
    router.navigate(href);
  }
}
function ActivePageMount({
  route,
  params,
  routes,
  router,
  scopeKey,
}: {
  route: ConsoleRoute;
  params: Readonly<Record<string, string>>;
  routes: readonly ConsoleRoute[];
  router: ConsoleRouterAdapter;
  scopeKey: string;
}) {
  const identity = useMemo(
    () => ({
      definition: route.binding.definition,
      services: route.binding.services,
      pattern: route.pattern,
      pathname: router.pathname,
      scopeKey,
    }),
    [
      route.binding.definition,
      route.binding.services,
      route.pattern,
      router.pathname,
      scopeKey,
    ]
  );
  const { activation, signal } = useConsoleActivation(identity);
  const navigation = useMemo<ConsoleLocalPageProps["navigation"]>(() => {
    const href = (pageId: string, input?: Readonly<Record<string, string>>) => {
      const target = routes.find(
        (item) => item.binding.id === route.binding.id && item.pageId === pageId
      );
      if (!target) {
        throw new Error(`Unknown Console local page: ${pageId}`);
      }
      return consoleRouteHref(target.pattern, input);
    };
    return {
      href,
      go: (pageId, input) => {
        if (activation.isCurrent()) {
          router.navigate(href(pageId, input));
        }
      },
    };
  }, [activation, route.binding.id, routes, router]);
  const Page = route.binding.definition.pages[route.pageId]!.component;
  return (
    <Page
      services={route.binding.services}
      activation={activation}
      signal={signal}
      params={params}
      navigation={navigation}
    />
  );
}

// A projection update must not re-render its publisher and republish an inline value.
const ActivePage = memo(ActivePageMount);

function NavigationList({
  items,
  activeId,
  router,
  onNavigate,
  sidebar = false,
  directory = false,
  onEdit,
}: {
  items: readonly ConsoleNavigationItem[];
  activeId: string;
  router: ConsoleRouterAdapter;
  onNavigate?: () => void;
  sidebar?: boolean;
  directory?: boolean;
  onEdit?: () => void;
}) {
  const longPress = useConsoleLongPress(onEdit);
  return (
    <ul {...stylex.props(styles.list, directory && styles.directoryList)}>
      {items.map((item) => {
        const href = consoleRouteHref(item.route.pattern);
        const destination = (
          <a
            {...stylex.props(
              styles.link,
              sidebar && styles.sidebarLink,
              directory && styles.directoryLink,
              item.id === activeId && styles.activeLink
            )}
            href={href}
            aria-current={item.id === activeId ? "page" : undefined}
            {...longPress}
            onClick={(event) => {
              interceptNavigation(event, router, href);
              if (event.defaultPrevented) {
                onNavigate?.();
              }
            }}
          >
            {(sidebar || directory) && (
              <span
                aria-hidden="true"
                {...stylex.props(styles.destinationIcon)}
              >
                {item.icon ?? <LayoutGrid size={20} />}
              </span>
            )}
            <span {...stylex.props(styles.destinationLabel)}>{item.label}</span>
          </a>
        );
        return (
          <li
            key={item.id}
            data-console-launcher-item={item.id}
            {...stylex.props(styles.launcherTile)}
          >
            {item.tooltip ? (
              <Tooltip.Root>
                <Tooltip.Trigger render={destination} />
                {/* Escape the launcher's rounded hit clip without losing its theme. */}
                <ThemeScope xstyle={styles.portalScope}>
                  <Tooltip.Portal>
                    <Tooltip.Positioner
                      side={sidebar ? "right" : "top"}
                      sideOffset={8}
                    >
                      <Tooltip.Popup>{item.tooltip}</Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </ThemeScope>
              </Tooltip.Root>
            ) : (
              destination
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ConsoleShell({
  plugins,
  router,
  session,
  basePath = "/",
  navigationDefaults,
  dock,
  settings,
  preferences: store,
  tabsPosition,
  topEdge,
  tableControls,
  navigationButton = false,
  renderStatus,
  children,
}: ConsoleShellProps) {
  const settingsEnabled = settings !== undefined;
  const settingsPath = settings?.path ?? "/settings";
  const settingsLabel = settings?.label ?? "Settings";
  const settingsBinding = useMemo(
    () =>
      settingsEnabled
        ? createConsoleSettingsBinding(settingsPath, settingsLabel)
        : undefined,
    [settingsEnabled, settingsPath, settingsLabel]
  );
  const installed = useMemo(
    () => (settingsBinding ? [...plugins, settingsBinding] : plugins),
    [plugins, settingsBinding]
  );
  const narrowSidebar = useSyncExternalStore(
    subscribeNarrowSidebar,
    narrowSidebarSnapshot,
    () => false
  );
  const model = useMemo(
    () => createConsoleModel(installed, basePath, dock?.leading),
    [installed, basePath, dock?.leading]
  );
  const defaults = useMemo(
    () => defaultConsolePreferences(model.navigation, navigationDefaults),
    [model.navigation, navigationDefaults]
  );
  const scopeKey = session?.scopeKey ?? "local";
  const preference = useConsolePreferences(store, scopeKey, defaults);
  const { value } = preference;
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const dockView = commandOpen
    ? "command"
    : directoryOpen
      ? "launcher"
      : "navigation";
  const [customizing, setCustomizing] = useState(false);
  const [editDraft, setEditDraft] = useState<ConsolePreferences | null>(null);
  const [query, setQuery] = useState("");
  const directoryId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const commandRef = useRef<HTMLInputElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const customizeRef = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLButtonElement | null>(null);
  const editingPresentation = useRef(false);
  const [editAnnouncement, setEditAnnouncement] = useState("");
  const [presentation, setPresentation] = useState(false);
  const viewChanged = useRef(false);
  useLayoutEffect(() => {
    if (viewChanged.current) {
      viewChanged.current = false;
      (customizing
        ? presentation
          ? dockRef.current?.querySelector<HTMLSelectElement>("select")
          : dockRef.current?.querySelector<HTMLButtonElement>(
              'button[aria-label^="Drag "], button[aria-label="Add destinations"]'
            )
        : editingPresentation.current
          ? settingsRef.current
          : customizeRef.current
      )?.focus({
        preventScroll: true,
      });
    }
  }, [customizing, presentation]);
  const changeView = (editing: boolean, presentationOnly = false) => {
    if (editing && (!preference.loaded || preference.busy)) {
      return;
    }
    viewChanged.current = true;
    if (editing) {
      editingPresentation.current = presentationOnly;
    }
    setEditDraft(editing ? value : null);
    setCustomizing(editing);
    setPresentation(presentationOnly);
    setEditAnnouncement("");
  };
  const [directoryMount, setDirectoryMount] = useState<HTMLDivElement | null>(
    null
  );
  const pointerIntent = useRef(true);
  const returnFocus = useRef<HTMLElement | null>(null);
  const commandFocus = useConsoleCommandFocus(commandOpen, dockRef, () =>
    directoryOpen
      ? customizing
        ? customizeRef.current
        : searchRef.current
      : null
  );
  const resolveCommandFocus = commandFocus.resolve;
  const openCommand = () => {
    if (commandOpen) {
      commandRef.current?.focus({ preventScroll: true });
      return;
    }
    pointerIntent.current = false;
    const previous = commandFocus.capture();
    if (!directoryOpen) {
      returnFocus.current = previous;
    }
    setCommandOpen(true);
  };
  const closeCommand = () => {
    commandFocus.restore();
    setCommandOpen(false);
  };
  useConsoleCommandKey(
    !session || session.state === "ready",
    openCommand,
    dockRef
  );
  useLayoutEffect(() => {
    setDirectoryOpen(false);
    setCommandOpen(false);
    setCustomizing(false);
    setEditDraft(null);
    setQuery("");
    returnFocus.current = null;
  }, [scopeKey, session?.state]);
  const navigation = visibleConsoleNavigation(model.navigation, session);
  const settingsItems = visibleConsoleSettings(model.settings, session);
  const settingsRoute = settingsBinding
    ? model.routes.find(
        (route) =>
          route.binding.id === consoleSettingsBindingId &&
          route.pageId === "index"
      )
    : undefined;
  const settingsAllowed =
    !!settingsRoute &&
    (!session || session.state === "ready") &&
    (!session?.canAccess ||
      session.canAccess(consoleSettingsBindingId, "index"));
  const pins = orderedConsolePins(navigation, value);
  const presetDocument = consoleDockPresets(value);
  const selectPreset = (id: string) => {
    if (preference.busy || !preference.loaded || customizing) {
      return;
    }
    const next = withConsoleDockPresets(value, presetDocument.presets, id);
    preference.change(next);
    void preference.save(next);
  };
  const match = model.routes
    .map((route) => ({
      route,
      params: router.match(route.pattern, router.pathname),
    }))
    .find((item) => item.params !== null);
  const permitted = !session || session.state === "ready";
  const routeAllowed =
    permitted &&
    match &&
    (!session?.canAccess ||
      session.canAccess(match.route.binding.id, match.route.pageId));
  const activeId = match
    ? (navigation.find(
        (item) =>
          item.reference.bindingId === match.route.binding.id &&
          item.pages.includes(match.route.pageId)
      )?.id ?? "")
    : "";
  let status: ConsoleShellStatus | null = null;
  if (!permitted) {
    status = session!.state as ConsoleShellStatus;
  } else if (model.routes.length === 0) {
    status = "empty";
  } else if (!match) {
    status = "not-found";
  } else if (!routeAllowed) {
    status = "forbidden";
  }
  const changeOpen = (open: boolean) => {
    if (customizing && !open) {
      return;
    }
    if (open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    setDirectoryOpen(open);
    if (!open) {
      setQuery("");
      setCustomizing(false);
      setEditDraft(null);
    }
  };
  const update = (next: Partial<ConsolePreferences>) =>
    preference.change({ ...value, ...next });
  const group =
    match && routeAllowed
      ? Object.values(match.route.binding.definition.pageGroups ?? {}).find(
          (candidate) =>
            candidate.tabs.some((tab) => tab.page === match.route.pageId) ||
            candidate.relatedPages?.[match.route.pageId]
        )
      : undefined;
  const activeTab =
    match && group
      ? (group.relatedPages?.[match.route.pageId]?.activeTab ??
        match.route.pageId)
      : "";
  const placement = tabsPosition ?? "top";
  const inlineTabs = placement === "content";
  const tabStyle =
    placement === "bottom"
      ? styles.tabsBottom
      : placement === "left"
        ? styles.tabsLeft
        : placement === "right"
          ? styles.tabsRight
          : styles.tabsTop;
  const visibleTabs =
    group && match
      ? group.tabs.filter(
          (tab) =>
            !session?.canAccess ||
            session.canAccess(match.route.binding.id, tab.page)
        )
      : [];
  const activeSetting =
    settingsAllowed && match
      ? settingsItems.find(
          (entry) =>
            entry.route.binding === match.route.binding &&
            (entry.route.pageId === match.route.pageId ||
              !!group?.tabs.some((tab) => tab.page === entry.route.pageId))
        )
      : undefined;
  const settingsReturn =
    activeSetting && settingsRoute
      ? {
          label: settingsLabel,
          onInvoke: () =>
            router.navigate(consoleRouteHref(settingsRoute.pattern)),
        }
      : undefined;
  const settingsContext: ConsoleTaskContext | undefined =
    settingsReturn && match
      ? visibleTabs.length > 1 && group
        ? {
            kind: "tabs",
            label: group.label,
            activeId: activeTab,
            tabs: visibleTabs.map((tab) => ({
              id: tab.page,
              label: tab.label,
              href: consoleRouteHref(
                model.routes.find(
                  (route) =>
                    route.binding === match.route.binding &&
                    route.pageId === tab.page
                )!.pattern,
                match.params!
              ),
            })),
            return: settingsReturn,
          }
        : {
            kind: "object",
            label: activeSetting!.label,
            return: settingsReturn,
          }
      : undefined;
  const pageNavigation =
    visibleTabs.length > 1 && group && match ? (
      <Tabs.Root
        value={activeTab}
        render={<nav aria-label={`${group.label} pages`} />}
        orientation={
          placement === "left" || placement === "right"
            ? "vertical"
            : "horizontal"
        }
        xstyle={[
          styles.tabs,
          inlineTabs ? styles.inlineTabs : tabStyle,
          value.mode === "sidebar" &&
            (placement === "top" || placement === "bottom") &&
            styles.mainCenteredTabs,
          !inlineTabs && styles.contextTabs,
        ]}
      >
        <Tabs.ListContainer>
          <Tabs.List
            aria-label={group.label}
            activateOnFocus={false}
            xstyle={
              placement !== "left" && placement !== "right"
                ? styles.horizontalTabList
                : undefined
            }
          >
            {visibleTabs.map((tab) => {
              const route = model.routes.find(
                (item) =>
                  item.binding.id === match.route.binding.id &&
                  item.pageId === tab.page
              )!;
              const href = consoleRouteHref(route.pattern, match.params!);
              return (
                <Tabs.Tab
                  key={tab.page}
                  value={tab.page}
                  nativeButton={false}
                  render={<a href={href}>{tab.label}</a>}
                  xstyle={[
                    styles.tabLink,
                    placement !== "left" && placement !== "right"
                      ? styles.horizontalTab
                      : undefined,
                  ]}
                  aria-current={activeTab === tab.page ? "page" : undefined}
                  onClick={(event) => interceptNavigation(event, router, href)}
                >
                  {tab.label}
                </Tabs.Tab>
              );
            })}
            <Tabs.Indicator />
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs.Root>
    ) : null;
  // Route activations retire actions immediately. A passive current-page label
  // keeps the geometry owner alive while the next page awaits its authorized data.
  const routeContext =
    routeAllowed && !inlineTabs && !pageNavigation
      ? {
          kind: "object" as const,
          label:
            match.route.binding.definition.pages[match.route.pageId]?.title ??
            navigation.find((item) => item.route.id === match.route.id)
              ?.label ??
            match.route.binding.id,
        }
      : undefined;
  const renderForeground = (
    selection: ConsoleDockSelection | null,
    page: ConsolePageContribution | null
  ) => (
    <ConsoleDockViewHost
      key={scopeKey}
      items={visibleConsoleDockViews(model.dockViews, session)}
      pathname={router.pathname}
      scopeKey={scopeKey}
      position={value.mode === "sidebar" ? "bottom" : value.position}
      blocked={!!selection?.running || !!selection?.blocked}
      suspended={
        !!selection?.running ||
        !!selection?.blocked ||
        dockView !== "navigation"
      }
    >
      {({ active, entries, restoreFocus }) => (
        <ConsoleLayout.Foreground>
          {value.mode === "sidebar" && permitted && (
            <nav
              {...stylex.props(styles.sidebar)}
              aria-label="Console navigation"
            >
              <Button variant="ghost" onClick={openCommand}>
                Command <kbd>⌘K</kbd>
              </Button>
              {entries.map((entry) => (
                <Button
                  key={entry.id}
                  data-console-dock-entry={entry.id}
                  disabled={entry.disabled}
                  onClick={(event) => entry.onInvoke(event.detail === 0)}
                >
                  {entry.label}
                </Button>
              ))}
              <NavigationList
                items={navigation}
                activeId={activeId}
                router={router}
                sidebar
              />
            </nav>
          )}
          <ConsoleDock
            key={scopeKey}
            visible={
              permitted &&
              (value.mode === "dock" ||
                !!selection ||
                dockView !== "navigation" ||
                active ||
                entries.length > 0)
            }
            navigationVisible={
              value.mode === "dock" ||
              !!selection ||
              dockView !== "navigation" ||
              active ||
              (narrowSidebar && entries.length > 0)
            }
            leading={entries}
            onNavigationReady={restoreFocus}
            position={value.mode === "sidebar" ? "bottom" : value.position}
            compact={false}
            activeId={activeId}
            items={(value.mode === "sidebar" && narrowSidebar ? [] : pins).map(
              (item) => ({
                id: item.id,
                label: item.label,
                ...(item.tooltip === undefined
                  ? {}
                  : { tooltip: item.tooltip }),
                icon: item.icon ?? <Menu size={16} aria-hidden="true" />,
              })
            )}
            overflow={
              value.mode === "sidebar" && narrowSidebar
                ? undefined
                : {
                    label: "Expand Dock",
                    onInvoke: () => changeOpen(!directoryOpen),
                    expanded: directoryOpen,
                    controls: directoryOpen ? directoryId : undefined,
                  }
            }
            selection={selection}
            running={selection?.running ?? false}
            dockRef={dockRef}
            instant={!pointerIntent.current}
            directory={dockView === "navigation" ? null : directory(page)}
            presets={{
              names:
                permitted && preference.loaded
                  ? presetDocument.presets.map((preset) => preset.name)
                  : [],
              activeIndex: presetDocument.presets.findIndex(
                (preset) => preset.id === presetDocument.activeId
              ),
              onSelect: (index, keyboard) => {
                if (keyboard) {
                  pointerIntent.current = false;
                }
                const preset = presetDocument.presets[index];
                if (preset) {
                  selectPreset(preset.id);
                }
              },
            }}
            onEdit={() => {
              changeOpen(true);
              changeView(true);
            }}
            onNavigate={(id) => {
              const item = navigation.find((candidate) => candidate.id === id);
              if (item) {
                router.navigate(consoleRouteHref(item.route.pattern));
              }
            }}
            onExpand={() => changeOpen(true)}
            onFocusDock={() => undefined}
          />
          <ConsoleContextBar
            {...(page?.context || settingsContext || routeContext
              ? { context: page?.context ?? settingsContext ?? routeContext }
              : {})}
            fallback={inlineTabs ? null : pageNavigation}
            router={router}
            sidebar={value.mode === "sidebar"}
            instant={!pointerIntent.current}
            position={placement}
          />
        </ConsoleLayout.Foreground>
      )}
    </ConsoleDockViewHost>
  );
  const navigationEntry = (
    <Popover.Trigger
      render={
        <ConsoleIconButton label="Console navigation">
          <Menu size={16} aria-hidden="true" />
        </ConsoleIconButton>
      }
    />
  );
  const layout = (
    <ConsoleLayout
      tableControls={tableControls}
      {...(topEdge ? { topEdge } : {})}
      onPointerDownCapture={() => {
        pointerIntent.current = true;
      }}
      onKeyDownCapture={() => {
        pointerIntent.current = false;
      }}
    >
      <ConsoleLayout.Corner
        area="topLeft"
        xstyle={value.mode === "sidebar" ? styles.sidebarCorner : undefined}
      >
        {(value.mode === "sidebar" || navigationButton || !permitted) &&
          navigationEntry}
      </ConsoleLayout.Corner>
      <ConsoleActionHost render={renderForeground}>
        {(page) => (
          <main
            tabIndex={-1}
            {...stylex.props(
              styles.content,
              value.mode === "sidebar" && styles.sidebarContent,
              value.mode === "dock" &&
                value.position === "left" &&
                styles.clearLeftDock,
              value.mode === "dock" &&
                value.position === "right" &&
                styles.clearRightDock,
              !!pageNavigation &&
                !page?.context &&
                !inlineTabs &&
                placement === "left" &&
                styles.clearLeftTabs,
              !!pageNavigation &&
                !page?.context &&
                !inlineTabs &&
                placement === "right" &&
                styles.clearRightTabs,
              !!pageNavigation &&
                !page?.context &&
                !inlineTabs &&
                placement === "top" &&
                styles.clearTopTabs,
              !!pageNavigation &&
                !page?.context &&
                !inlineTabs &&
                placement === "bottom" &&
                styles.clearBottomTabs
            )}
          >
            {inlineTabs && !page?.context && !settingsContext && pageNavigation}
            {status ? (
              <Status status={status} render={renderStatus} />
            ) : (
              match && (
                <PageBoundary
                  key={JSON.stringify([
                    match.route.id,
                    router.pathname,
                    scopeKey,
                  ])}
                  fallback={<Status status="error" render={renderStatus} />}
                >
                  <ActivePage
                    route={match.route}
                    params={match.params!}
                    routes={model.routes}
                    router={router}
                    scopeKey={scopeKey}
                  />
                </PageBoundary>
              )
            )}
          </main>
        )}
      </ConsoleActionHost>
      {children}
    </ConsoleLayout>
  );
  const directory = (page: ConsolePageContribution | null) => (
    <div ref={setDirectoryMount}>
      {directoryMount && (
        <Popover.Portal container={directoryMount}>
          <Popover.Positioner
            style={{
              position: "relative",
              top: 0,
              left: 0,
              transform: "none",
              width: "100%",
              opacity: 1,
            }}
            xstyle={styles.trayPositioner}
          >
            <Popover.Popup
              id={directoryId}
              data-console-dock-view={dockView}
              aria-label={commandOpen ? "Command" : "Console navigation"}
              initialFocus={commandOpen ? commandRef : searchRef}
              finalFocus={() =>
                commandOpen && resolveCommandFocus()
                  ? resolveCommandFocus()
                  : value.mode === "sidebar"
                    ? document.querySelector<HTMLElement>(
                        'button[aria-label="Console navigation"]'
                      )
                    : returnFocus.current?.isConnected
                      ? returnFocus.current
                      : document.querySelector<HTMLElement>(
                          'button[aria-label="Console navigation"], button[aria-label="Expand Dock"]'
                        )
              }
              xstyle={styles.tray}
            >
              {commandOpen && command(page)}
              {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Bubble Escape from child controls without making the content wrapper a focusable widget. */}
              <div
                hidden={commandOpen}
                inert={commandOpen}
                {...stylex.props(
                  styles.directory,
                  customizing && styles.editingDirectory,
                  commandOpen && styles.hiddenContent
                )}
                onKeyDown={(event) => {
                  // Portalled menus own Escape before the editor does.
                  if (!event.currentTarget.contains(event.target as Node)) {
                    return;
                  }
                  if (
                    event.key === "Escape" &&
                    customizing &&
                    !event.defaultPrevented
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!preference.busy) {
                      changeView(false);
                    }
                  }
                }}
              >
                {!customizing && (
                  <div {...stylex.props(styles.trayHeader)}>
                    <label {...stylex.props(styles.searchField)}>
                      <Search size={18} aria-hidden="true" />
                      <input
                        ref={searchRef}
                        {...stylex.props(styles.search)}
                        aria-label="Search navigation"
                        placeholder="Find a destination"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <ConsoleIconButton
                      label="Close navigation"
                      variant="ghost"
                      xstyle={styles.trayClose}
                      onClick={() => changeOpen(false)}
                    >
                      <X size={16} aria-hidden="true" />
                    </ConsoleIconButton>
                  </div>
                )}
                {!customizing && (
                  <>
                    {preference.error && !customizing && (
                      <div {...stylex.props(styles.controls)}>
                        <p role="alert">{preference.error}</p>
                        <Button
                          variant="outline"
                          disabled={preference.busy}
                          onClick={() => preference.reload()}
                        >
                          Reload preferences
                        </Button>
                      </div>
                    )}
                    <section
                      aria-label="Destinations"
                      {...stylex.props(styles.launcher)}
                    >
                      {!query && pins.length > 0 && (
                        <>
                          <h3 {...stylex.props(styles.moduleTitle)}>
                            In this preset
                          </h3>
                          <NavigationList
                            items={pins}
                            activeId={activeId}
                            router={router}
                            directory
                            onNavigate={() => changeOpen(false)}
                            onEdit={() => changeView(true)}
                          />
                        </>
                      )}
                      <h3 {...stylex.props(styles.moduleTitle)}>
                        {query ? "Search results" : "All destinations"}
                      </h3>
                      <NavigationList
                        items={navigation.filter(
                          (item) =>
                            (query ||
                              !pins.some((pin) => pin.id === item.id)) &&
                            item.label
                              .toLocaleLowerCase()
                              .includes(query.toLocaleLowerCase())
                        )}
                        activeId={activeId}
                        router={router}
                        directory
                        onNavigate={() => changeOpen(false)}
                        onEdit={() => changeView(true)}
                      />
                      {!navigation.some((item) =>
                        item.label
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase())
                      ) && (
                        <output {...stylex.props(styles.empty)}>
                          {query
                            ? "No matching destinations."
                            : "No destinations are available."}
                        </output>
                      )}
                    </section>
                    <section
                      aria-label="Quick controls"
                      {...stylex.props(styles.quickControls)}
                    >
                      <ConsoleIconButton
                        label="Command"
                        tooltip="Command (⌘K / Ctrl+K)"
                        variant="ghost"
                        onClick={openCommand}
                        xstyle={styles.quickControl}
                      >
                        <Search size={18} aria-hidden="true" />
                      </ConsoleIconButton>
                      <ConsoleIconButton
                        label={
                          value.mode === "dock" ? "Use sidebar" : "Use Dock"
                        }
                        variant="ghost"
                        onClick={() => {
                          const next = {
                            ...value,
                            mode: value.mode === "dock" ? "sidebar" : "dock",
                          } satisfies ConsolePreferences;
                          update(next);
                          void preference.save(next);
                        }}
                        disabled={
                          customizing || preference.busy || !preference.loaded
                        }
                        xstyle={styles.quickControl}
                      >
                        {value.mode === "dock" ? (
                          <PanelLeft size={18} aria-hidden="true" />
                        ) : (
                          <LayoutGrid size={18} aria-hidden="true" />
                        )}
                      </ConsoleIconButton>
                      <ConsolePresetSwitcher
                        value={value}
                        disabled={preference.busy || !preference.loaded}
                        onSelect={selectPreset}
                        compact
                      />
                      <ConsoleIconButton
                        ref={customizeRef}
                        label="Customize navigation"
                        variant="ghost"
                        onClick={() => changeView(true)}
                        disabled={!preference.loaded || preference.busy}
                        xstyle={styles.quickControl}
                      >
                        <Settings2 size={18} aria-hidden="true" />
                      </ConsoleIconButton>
                      <ConsoleIconButton
                        ref={settingsRef}
                        label="Navigation settings"
                        variant="ghost"
                        xstyle={styles.quickControl}
                        disabled={!preference.loaded || preference.busy}
                        onClick={() => changeView(true, true)}
                      >
                        <SlidersHorizontal size={18} aria-hidden="true" />
                      </ConsoleIconButton>
                    </section>
                  </>
                )}
                {customizing && editDraft && (
                  <ConsoleNavigationEditor
                    value={editDraft}
                    busy={preference.busy}
                    loaded={preference.loaded}
                    error={preference.error}
                    presentation={presentation}
                    onChange={setEditDraft}
                    onCancel={() => changeView(false)}
                    onSave={async () => {
                      if (await preference.save(editDraft)) {
                        changeView(false);
                      }
                    }}
                    onReload={() => {
                      changeView(false);
                      preference.reload();
                    }}
                  >
                    <div {...stylex.props(styles.launcher)}>
                      <ConsolePresetCollection
                        value={editDraft}
                        items={navigation}
                        busy={preference.busy}
                        suspended={commandOpen}
                        onChange={setEditDraft}
                        announce={setEditAnnouncement}
                      />
                    </div>
                    <output
                      aria-live="polite"
                      {...stylex.props(styles.editHint)}
                    >
                      {editAnnouncement}
                    </output>
                  </ConsoleNavigationEditor>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      )}
    </div>
  );
  const command = (page: ConsolePageContribution | null) => (
    <ConsoleCommand
      inputRef={commandRef}
      onClose={closeCommand}
      destinations={navigation.map((item) => ({
        id: item.id,
        label: item.label,
        onInvoke() {
          router.navigate(consoleRouteHref(item.route.pattern));
          closeCommand();
        },
      }))}
      presets={presetDocument.presets.map((preset) => ({
        id: preset.id,
        label: preset.name,
        disabled: preference.busy || !preference.loaded || customizing,
        onInvoke() {
          selectPreset(preset.id);
          closeCommand();
        },
      }))}
      actions={(page?.commands ?? []).map((action) => ({
        ...action,
        onInvoke() {
          closeCommand();
          action.onInvoke();
        },
      }))}
    />
  );
  return (
    <Popover.Root
      open={dockView !== "navigation"}
      onOpenChange={(open) => {
        if (commandOpen && !open) {
          closeCommand();
        } else {
          changeOpen(open);
        }
      }}
    >
      <ConsoleSettingsContext.Provider
        value={{ items: settingsItems, label: settingsLabel, router }}
      >
        {layout}
      </ConsoleSettingsContext.Provider>
    </Popover.Root>
  );
}
