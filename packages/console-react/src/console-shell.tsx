import { Button } from "@lenso/ui/button";
import { Modal as Dialog } from "@lenso/ui/modal";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp, Menu, Pin, X } from "lucide-react";
import {
  Component,
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
} from "./composition";
import { ConsoleActionHost } from "./console-action-scope";
import { useConsoleActivation } from "./console-activation";
import { ConsoleDock, type ConsoleDockSelection } from "./console-dock";
import { ConsoleDockViewHost } from "./console-dock-view";
import { ConsoleIconButton } from "./console-icon-button";
import { ConsoleLayout, type ConsoleLayoutProps } from "./console-layout";
import {
  consolePositions,
  consoleReferenceKey,
  consoleRouteHref,
  createConsoleModel,
  defaultConsolePreferences,
  moveConsolePin,
  orderedConsolePins,
  visibleConsoleNavigation,
  visibleConsoleDockViews,
  type ConsoleNavigationItem,
  type ConsoleRoute,
  type ConsoleShellBinding,
} from "./console-model";
import { useConsolePreferences } from "./console-preferences";
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
  preferences?: ConsolePreferenceStore;
  tabsPosition?: ConsolePreferences["position"] | "content";
  topEdge?: ConsoleLayoutProps["topEdge"];
  renderStatus?: (status: ConsoleShellStatus) => ReactNode;
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
function subscribeCompactNavigation(listener: () => void) {
  const query = window.matchMedia("(max-width: 960px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function compactNavigationSnapshot() {
  return window.matchMedia("(max-width: 960px)").matches;
}
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
  event: MouseEvent<HTMLAnchorElement>,
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
function ActivePage({
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

function NavigationList({
  items,
  activeId,
  router,
  onNavigate,
}: {
  items: readonly ConsoleNavigationItem[];
  activeId: string;
  router: ConsoleRouterAdapter;
  onNavigate?: () => void;
}) {
  return (
    <ul {...stylex.props(styles.list)}>
      {items.map((item) => {
        const href = consoleRouteHref(item.route.pattern);
        return (
          <li key={item.id}>
            <a
              {...stylex.props(
                styles.link,
                item.id === activeId && styles.activeLink
              )}
              href={href}
              aria-current={item.id === activeId ? "page" : undefined}
              onClick={(event) => {
                interceptNavigation(event, router, href);
                if (event.defaultPrevented) {
                  onNavigate?.();
                }
              }}
            >
              {item.label}
            </a>
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
  preferences: store,
  tabsPosition,
  topEdge,
  renderStatus,
}: ConsoleShellProps) {
  const compactNavigation = useSyncExternalStore(
    subscribeCompactNavigation,
    compactNavigationSnapshot,
    () => false
  );
  const narrowSidebar = useSyncExternalStore(
    subscribeNarrowSidebar,
    narrowSidebarSnapshot,
    () => false
  );
  const model = useMemo(
    () => createConsoleModel(plugins, basePath, dock?.leading),
    [plugins, basePath, dock?.leading]
  );
  const defaults = useMemo(
    () => defaultConsolePreferences(model.navigation, navigationDefaults),
    [model.navigation, navigationDefaults]
  );
  const scopeKey = session?.scopeKey ?? "local";
  const preference = useConsolePreferences(store, scopeKey, defaults);
  const { value } = preference;
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setDirectoryOpen(false);
    setQuery("");
    returnFocus.current = null;
  }, [scopeKey, session?.state]);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const dragIndex = useRef<number | null>(null);
  const navigation = visibleConsoleNavigation(model.navigation, session);
  const pins = orderedConsolePins(navigation, value);
  const pinnedIds = new Set(pins.map((item) => item.id));
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
    if (open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    setDirectoryOpen(open);
    if (!open) {
      setQuery("");
      requestAnimationFrame(() => {
        const target = returnFocus.current?.isConnected
          ? returnFocus.current
          : document.querySelector<HTMLElement>(
              '[aria-label="Console navigation"]'
            );
        target?.focus();
      });
    }
  };
  const update = (next: Partial<ConsolePreferences>) =>
    preference.change({ ...value, ...next });
  const togglePin = (item: ConsoleNavigationItem) => {
    const present = value.pinned.some(
      (reference) => consoleReferenceKey(reference) === item.id
    );
    update({
      pinned: present
        ? value.pinned.filter(
            (reference) => consoleReferenceKey(reference) !== item.id
          )
        : [...value.pinned, item.reference],
    });
  };
  const reorder = (from: number, to: number) =>
    update({ pinned: moveConsolePin(value.pinned, from, to) });
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
  const placement =
    tabsPosition ??
    (value.position === "top"
      ? "bottom"
      : value.position === "left"
        ? "right"
        : value.position === "right"
          ? "left"
          : "top");
  const inlineTabs =
    compactNavigation || value.mode === "sidebar" || placement === "content";
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
  const pageNavigation =
    visibleTabs.length > 1 && group && match ? (
      <nav
        {...stylex.props(
          styles.tabs,
          inlineTabs ? styles.inlineTabs : tabStyle
        )}
        aria-label={group.label}
      >
        {visibleTabs.map((tab) => {
          const route = model.routes.find(
            (item) =>
              item.binding.id === match.route.binding.id &&
              item.pageId === tab.page
          )!;
          const href = consoleRouteHref(route.pattern, match.params!);
          return (
            <a
              key={tab.page}
              {...stylex.props(
                styles.link,
                activeTab === tab.page && styles.activeLink
              )}
              aria-current={activeTab === tab.page ? "page" : undefined}
              href={href}
              onClick={(event) => interceptNavigation(event, router, href)}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>
    ) : null;
  const renderForeground = (selection: ConsoleDockSelection | null) => (
    <ConsoleDockViewHost
      key={scopeKey}
      items={visibleConsoleDockViews(model.dockViews, session)}
      pathname={router.pathname}
      scopeKey={scopeKey}
      position={value.mode === "sidebar" ? "bottom" : value.position}
      blocked={!!selection?.running || !!selection?.blocked}
    >
      {({ active, entries, restoreFocus }) => (
        <ConsoleLayout.Foreground>
          {value.mode === "sidebar" && permitted && (
            <nav
              {...stylex.props(styles.sidebar)}
              aria-label="Console navigation"
            >
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
              />
            </nav>
          )}
          <ConsoleDock
            visible={
              permitted &&
              (value.mode === "dock" ||
                !!selection ||
                active ||
                entries.length > 0)
            }
            navigationVisible={
              value.mode === "dock" ||
              !!selection ||
              (narrowSidebar && entries.length > 0)
            }
            position={value.mode === "sidebar" ? "bottom" : value.position}
            compact={false}
            activeId={activeId}
            items={(value.mode === "sidebar" && narrowSidebar ? [] : pins).map(
              (item) => ({
                id: item.id,
                label: item.label,
                icon: item.icon ?? <Menu size={16} aria-hidden="true" />,
              })
            )}
            overflow={
              value.mode === "sidebar" && narrowSidebar
                ? undefined
                : {
                    label: "Expand Dock",
                    onInvoke: () => changeOpen(true),
                  }
            }
            leading={entries}
            selection={selection}
            running={selection?.running ?? false}
            dockRef={dockRef}
            onNavigate={(id) => {
              const item = navigation.find((candidate) => candidate.id === id);
              if (item) {
                router.navigate(consoleRouteHref(item.route.pattern));
              }
            }}
            onExpand={() => changeOpen(true)}
            onFocusDock={() => undefined}
            onNavigationReady={restoreFocus}
          />
          {!inlineTabs && pageNavigation}
        </ConsoleLayout.Foreground>
      )}
    </ConsoleDockViewHost>
  );
  return (
    <Dialog.Root open={directoryOpen} onOpenChange={changeOpen}>
      <ConsoleLayout {...(topEdge ? { topEdge } : {})}>
        <ConsoleLayout.Corner area="topLeft">
          <Dialog.Trigger
            render={
              <ConsoleIconButton
                label="Console navigation"
                onClick={() => changeOpen(true)}
              >
                <Menu size={16} aria-hidden="true" />
              </ConsoleIconButton>
            }
          />
          {routeAllowed &&
            match?.route.binding.definition.pages[match.route.pageId]
              ?.title && (
              <span {...stylex.props(styles.location)}>
                {
                  match.route.binding.definition.pages[match.route.pageId]!
                    .title
                }
              </span>
            )}
        </ConsoleLayout.Corner>
        <ConsoleActionHost render={renderForeground}>
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
                !inlineTabs &&
                placement === "left" &&
                styles.clearLeftTabs,
              !!pageNavigation &&
                !inlineTabs &&
                placement === "right" &&
                styles.clearRightTabs,
              !!pageNavigation &&
                !inlineTabs &&
                placement === "top" &&
                styles.clearTopTabs,
              !!pageNavigation &&
                !inlineTabs &&
                placement === "bottom" &&
                styles.clearBottomTabs
            )}
          >
            {inlineTabs && pageNavigation}
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
        </ConsoleActionHost>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Viewport>
            <Dialog.Popup
              xstyle={[styles.tray(value.position), styles.narrowTray]}
            >
              <div {...stylex.props(styles.directory)}>
                <div {...stylex.props(styles.controls)}>
                  <Dialog.Title>Console navigation</Dialog.Title>
                  <ConsoleIconButton
                    label="Close navigation"
                    onClick={() => changeOpen(false)}
                  >
                    <X size={16} aria-hidden="true" />
                  </ConsoleIconButton>
                </div>
                <input
                  {...stylex.props(styles.search)}
                  aria-label="Search navigation"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <NavigationList
                  items={navigation.filter((item) =>
                    item.label
                      .toLocaleLowerCase()
                      .includes(query.toLocaleLowerCase())
                  )}
                  activeId={activeId}
                  router={router}
                  onNavigate={() => changeOpen(false)}
                />
                <h2>Pinned navigation</h2>
                <ul {...stylex.props(styles.list)}>
                  {pins.map((item) => {
                    const index = value.pinned.findIndex(
                      (reference) => consoleReferenceKey(reference) === item.id
                    );
                    return (
                      // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Native list-item drag/drop has equivalent labelled keyboard reorder buttons below.
                      <li
                        key={item.id}
                        {...stylex.props(styles.row)}
                        draggable
                        onDragStart={() => {
                          dragIndex.current = index;
                        }}
                        onDragEnd={() => {
                          dragIndex.current = null;
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (dragIndex.current !== null) {
                            reorder(dragIndex.current, index);
                          }
                          dragIndex.current = null;
                        }}
                      >
                        <span>{item.label}</span>
                        <ConsoleIconButton
                          label={`Move ${item.label} earlier`}
                          disabled={index === 0}
                          onClick={() => reorder(index, index - 1)}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </ConsoleIconButton>
                        <ConsoleIconButton
                          label={`Move ${item.label} later`}
                          disabled={index === value.pinned.length - 1}
                          onClick={() => reorder(index, index + 1)}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </ConsoleIconButton>
                        <Button onClick={() => togglePin(item)}>
                          Unpin {item.label}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <div {...stylex.props(styles.controls)}>
                  {navigation
                    .filter((item) => !pinnedIds.has(item.id))
                    .map((item) => (
                      <Button key={item.id} onClick={() => togglePin(item)}>
                        <Pin size={16} aria-hidden="true" /> Pin {item.label}
                      </Button>
                    ))}
                </div>
                <div {...stylex.props(styles.controls)}>
                  <label>
                    Navigation mode{" "}
                    <select
                      value={value.mode}
                      onChange={(event) =>
                        update({
                          mode: event.target
                            .value as ConsolePreferences["mode"],
                        })
                      }
                    >
                      <option value="dock">Dock</option>
                      <option value="sidebar">Sidebar</option>
                    </select>
                  </label>
                  <label>
                    Dock position{" "}
                    <select
                      value={value.position}
                      onChange={(event) =>
                        update({
                          position: event.target
                            .value as ConsolePreferences["position"],
                        })
                      }
                    >
                      {consolePositions.map((position) => (
                        <option key={position} value={position}>
                          {position}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button onClick={() => preference.reset()}>
                    Reset navigation
                  </Button>
                  {store && (
                    <>
                      <Button
                        disabled={preference.busy || !preference.loaded}
                        onClick={() => void preference.save()}
                      >
                        Save preferences
                      </Button>
                      <Button
                        disabled={preference.busy}
                        onClick={() => preference.reload()}
                      >
                        Reload preferences
                      </Button>
                    </>
                  )}
                </div>
                {preference.error && <p role="alert">{preference.error}</p>}
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </ConsoleLayout>
    </Dialog.Root>
  );
}
